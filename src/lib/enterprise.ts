import { prisma } from "./db";
import { audit } from "./auth";

export async function ensureEnterpriseSeed(adminUserId: string) {
  let org = await prisma.organization.findUnique({ where: { code: "MEDCARE-HQ" } });
  if (!org) {
    org = await prisma.organization.create({
      data: {
        name: "MedCare Health System",
        code: "MEDCARE-HQ",
        countryCode: "JP",
        status: "active",
      },
    });
    const clinical = await prisma.orgUnit.create({
      data: { orgId: org.id, name: "Clinical Operations" },
    });
    await prisma.orgUnit.createMany({
      data: [
        { orgId: org.id, name: "Cardiology", parentId: clinical.id },
        { orgId: org.id, name: "Emergency", parentId: clinical.id },
        { orgId: org.id, name: "Information Technology" },
        { orgId: org.id, name: "Finance & Procurement" },
      ],
    });
    await prisma.orgMembership.create({
      data: { orgId: org.id, userId: adminUserId, role: "org_admin", department: "Information Technology" },
    });
    await prisma.ssoConnection.createMany({
      data: [
        {
          orgId: org.id,
          protocol: "SAML",
          provider: "Okta",
          entityId: "https://medcare.local/saml/metadata",
          metadataUrl: "https://idp.example.com/metadata",
          enabled: true,
        },
        {
          orgId: org.id,
          protocol: "OIDC",
          provider: "Azure AD",
          clientId: "medcare-enterprise-oidc",
          metadataUrl: "https://login.microsoftonline.com/common/v2.0/.well-known/openid-configuration",
          enabled: true,
        },
      ],
    });
    const wf = await prisma.workflowDefinition.create({
      data: {
        orgId: org.id,
        name: "Purchase approval chain",
        trigger: "budget_spend",
        stepsJson: JSON.stringify([
          { step: 1, role: "department_lead", action: "approve" },
          { step: 2, role: "finance", action: "approve" },
          { step: 3, role: "org_admin", action: "final" },
        ]),
        active: true,
      },
    });
    await prisma.approvalRequest.create({
      data: {
        workflowId: wf.id,
        requesterId: adminUserId,
        title: "Approve imaging modality license expansion",
        status: "pending",
        payloadJson: JSON.stringify({ amountYen: 2500000 }),
      },
    });
    await prisma.budgetLine.createMany({
      data: [
        { orgId: org.id, category: "IT Infrastructure", fiscalYear: 2026, amountYen: 50000000, spentYen: 12500000 },
        { orgId: org.id, category: "Clinical Equipment", fiscalYear: 2026, amountYen: 120000000, spentYen: 48000000 },
        { orgId: org.id, category: "Training & CME", fiscalYear: 2026, amountYen: 8000000, spentYen: 2100000 },
      ],
    });
    await prisma.contract.createMany({
      data: [
        {
          orgId: org.id,
          vendor: "Cloud Hosting Provider",
          title: "Managed Kubernetes & DB",
          valueYen: 18000000,
          status: "active",
          startsAt: new Date("2026-01-01"),
          endsAt: new Date("2026-12-31"),
        },
        {
          orgId: org.id,
          vendor: "Lab Partner Co",
          title: "Reference lab services",
          valueYen: 9600000,
          status: "active",
        },
      ],
    });
    await prisma.softwareLicense.createMany({
      data: [
        { orgId: org.id, product: "MedCare Enterprise Suite", seats: 500, usedSeats: 312, status: "active", renewsAt: new Date("2027-03-31") },
        { orgId: org.id, product: "PACS Viewer Pro", seats: 80, usedSeats: 64, status: "active", renewsAt: new Date("2026-11-01") },
      ],
    });
  } else {
    await prisma.orgMembership.upsert({
      where: { orgId_userId: { orgId: org.id, userId: adminUserId } },
      update: {},
      create: { orgId: org.id, userId: adminUserId, role: "org_admin" },
    });
  }
  return org;
}

export async function buildEnterpriseDashboard(userId: string) {
  const org = await ensureEnterpriseSeed(userId);
  const [units, members, sso, workflows, approvals, budgets, contracts, licenses, userCount] =
    await Promise.all([
      prisma.orgUnit.findMany({ where: { orgId: org.id }, include: { children: true } }),
      prisma.orgMembership.findMany({
        where: { orgId: org.id },
        include: { user: { select: { id: true, name: true, email: true, role: true } } },
      }),
      prisma.ssoConnection.findMany({ where: { orgId: org.id } }),
      prisma.workflowDefinition.findMany({ where: { orgId: org.id } }),
      prisma.approvalRequest.findMany({
        orderBy: { createdAt: "desc" },
        take: 30,
        include: { requester: { select: { name: true } }, workflow: true },
      }),
      prisma.budgetLine.findMany({ where: { orgId: org.id } }),
      prisma.contract.findMany({ where: { orgId: org.id } }),
      prisma.softwareLicense.findMany({ where: { orgId: org.id } }),
      prisma.user.count({ where: { active: true } }),
    ]);

  const roots = units.filter((u) => !u.parentId);
  const analytics = {
    members: members.length,
    departments: units.length,
    budgetYen: budgets.reduce((s, b) => s + b.amountYen, 0),
    spentYen: budgets.reduce((s, b) => s + b.spentYen, 0),
    activeContracts: contracts.filter((c) => c.status === "active").length,
    licenseUtilization: licenses.map((l) => ({
      product: l.product,
      used: l.usedSeats,
      seats: l.seats,
      pct: l.seats ? Math.round((l.usedSeats / l.seats) * 100) : 0,
    })),
    platformUsers: userCount,
  };

  return {
    organization: org,
    multiOrganization: await prisma.organization.findMany({ orderBy: { name: "asc" } }),
    departmentHierarchy: roots.map((r) => ({
      id: r.id,
      name: r.name,
      children: r.children.map((c) => ({ id: c.id, name: c.name })),
    })),
    roleBasedPermissions: members.map((m) => ({
      user: m.user.name,
      email: m.user.email,
      platformRole: m.user.role,
      orgRole: m.role,
      department: m.department,
    })),
    singleSignOn: sso,
    organizationAnalytics: analytics,
    customWorkflows: workflows.map((w) => ({
      ...w,
      steps: JSON.parse(w.stepsJson) as unknown[],
    })),
    approvalChains: approvals,
    budgetManagement: budgets,
    contractManagement: contracts,
    licenseManagement: licenses,
  };
}

export async function decideApproval(opts: {
  approvalId: string;
  deciderId: string;
  decision: "approved" | "rejected";
}) {
  const row = await prisma.approvalRequest.update({
    where: { id: opts.approvalId },
    data: {
      status: opts.decision,
      deciderId: opts.deciderId,
      decidedAt: new Date(),
    },
  });
  await audit(opts.deciderId, `enterprise.approval_${opts.decision}`, "ApprovalRequest", row.id);
  return row;
}

export async function createOrganization(opts: {
  name: string;
  code: string;
  countryCode?: string;
  actorId: string;
}) {
  const org = await prisma.organization.create({
    data: {
      name: opts.name,
      code: opts.code,
      countryCode: opts.countryCode || "JP",
    },
  });
  await prisma.orgMembership.create({
    data: { orgId: org.id, userId: opts.actorId, role: "org_admin" },
  });
  await audit(opts.actorId, "enterprise.org_create", "Organization", org.id);
  return org;
}
