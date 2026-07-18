import { NextRequest, NextResponse } from "next/server";
import { getSession, audit } from "@/lib/auth";
import { sendEmail } from "@/lib/mail";
import { prisma } from "@/lib/db";

async function getCompanyProfile(session: { id: string; role: string }) {
  if (session.role === "COMPANY") {
    return prisma.companyProfile.findUnique({ where: { userId: session.id } });
  }
  return prisma.companyProfile.findFirst({
    orderBy: { name: "asc" },
  });
}

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (session.role !== "COMPANY" && session.role !== "ADMIN" && session.role !== "DEVELOPER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const profile = await getCompanyProfile(session);
  if (!profile) {
    return NextResponse.json({
      profile: null,
      employeeCount: 0,
      employees: [],
      campaigns: [],
      certificates: [],
      sickLeaves: [],
      report: null,
    });
  }

  const [employees, campaigns, certificates, sickLeaves] = await Promise.all([
    prisma.corporateEmployee.findMany({
      where: { companyId: profile.id },
      orderBy: { name: "asc" },
    }),
    prisma.corporateCampaign.findMany({
      where: { companyId: profile.id },
      orderBy: { createdAt: "desc" },
    }),
    prisma.medicalCertificate.findMany({
      where: { companyId: profile.id },
      orderBy: { issuedAt: "desc" },
      take: 50,
    }),
    prisma.sickLeaveRecord.findMany({
      where: { companyId: profile.id },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
  ]);

  const vaccinated = employees.filter((e) => e.vaccinatedAt).length;
  const checkedUp = employees.filter((e) => e.lastCheckupAt).length;
  const activeCampaigns = campaigns.filter((c) => c.status === "active");
  const avgParticipation =
    campaigns.length === 0
      ? 0
      : Math.round(
          campaigns.reduce((s, c) => {
            const rate = c.targetCount > 0 ? (c.participation / c.targetCount) * 100 : c.participation;
            return s + rate;
          }, 0) / campaigns.length
        );

  const report = {
    employeeCount: employees.length || profile.employeeCount,
    vaccinationRate: employees.length ? Math.round((vaccinated / employees.length) * 100) : 0,
    checkupParticipation: employees.length ? Math.round((checkedUp / employees.length) * 100) : 0,
    avgCampaignParticipation: avgParticipation,
    openSickLeave: sickLeaves.filter((s) => s.status === "open").length,
    certificatesIssued: certificates.length,
    activeCampaigns: activeCampaigns.length,
    insuranceSupport: profile.insuranceSupport,
    generatedAt: new Date().toISOString(),
  };

  return NextResponse.json({
    profile,
    employeeCount: employees.length || profile.employeeCount,
    employees,
    campaigns,
    certificates,
    sickLeaves,
    report,
  });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (session.role !== "COMPANY" && session.role !== "ADMIN" && session.role !== "DEVELOPER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const profile = await getCompanyProfile(session);
  if (!profile) return NextResponse.json({ error: "Company profile required" }, { status: 400 });

  const body = await req.json();
  const action = body.action as string;

  if (action === "add_employee") {
    const emp = await prisma.corporateEmployee.create({
      data: {
        companyId: profile.id,
        name: String(body.name),
        email: String(body.email).toLowerCase(),
        department: body.department ? String(body.department) : null,
        status: body.status || "active",
        userId: body.userId || null,
        lastCheckupAt: body.lastCheckupAt ? new Date(body.lastCheckupAt) : null,
        vaccinatedAt: body.vaccinatedAt ? new Date(body.vaccinatedAt) : null,
      },
    });
    await prisma.companyProfile.update({
      where: { id: profile.id },
      data: { employeeCount: { increment: 1 } },
    });
    await audit(session.id, "corporate.add_employee", "CorporateEmployee", emp.id);
    return NextResponse.json({ employee: emp });
  }

  if (action === "update_employee") {
    const emp = await prisma.corporateEmployee.update({
      where: { id: String(body.id) },
      data: {
        name: body.name != null ? String(body.name) : undefined,
        department: body.department != null ? String(body.department) : undefined,
        status: body.status != null ? String(body.status) : undefined,
        lastCheckupAt: body.lastCheckupAt ? new Date(body.lastCheckupAt) : body.clearCheckup ? null : undefined,
        vaccinatedAt: body.vaccinatedAt ? new Date(body.vaccinatedAt) : body.clearVaccine ? null : undefined,
      },
    });
    return NextResponse.json({ employee: emp });
  }

  if (action === "schedule_checkup") {
    const ids: string[] = Array.isArray(body.employeeIds) ? body.employeeIds : [];
    const when = body.scheduledAt ? new Date(body.scheduledAt) : new Date();
    if (ids.length) {
      await prisma.corporateEmployee.updateMany({
        where: { id: { in: ids }, companyId: profile.id },
        data: { lastCheckupAt: when },
      });
    } else {
      await prisma.corporateEmployee.updateMany({
        where: { companyId: profile.id, status: "active" },
        data: { lastCheckupAt: when },
      });
    }
    await prisma.companyProfile.update({
      where: { id: profile.id },
      data: {
        healthCheckSchedule: `${profile.healthCheckSchedule || ""}\n${when.toISOString().slice(0, 10)}: scheduled checkups`.trim(),
      },
    });
    await audit(session.id, "corporate.schedule_checkup", "CompanyProfile", profile.id);
    return NextResponse.json({ ok: true, scheduledAt: when });
  }

  if (action === "record_vaccination") {
    const emp = await prisma.corporateEmployee.update({
      where: { id: String(body.employeeId) },
      data: { vaccinatedAt: body.vaccinatedAt ? new Date(body.vaccinatedAt) : new Date() },
    });
    return NextResponse.json({ employee: emp });
  }

  if (action === "create_campaign") {
    const campaign = await prisma.corporateCampaign.create({
      data: {
        companyId: profile.id,
        name: String(body.name),
        type: String(body.type || "health"),
        status: String(body.status || "planned"),
        participation: Number(body.participation) || 0,
        targetCount: Number(body.targetCount) || profile.employeeCount || 0,
        scheduledAt: body.scheduledAt ? new Date(body.scheduledAt) : null,
        notes: body.notes ? String(body.notes) : null,
      },
    });
    await audit(session.id, "corporate.create_campaign", "CorporateCampaign", campaign.id);
    return NextResponse.json({ campaign });
  }

  if (action === "update_campaign") {
    const campaign = await prisma.corporateCampaign.update({
      where: { id: String(body.id) },
      data: {
        status: body.status != null ? String(body.status) : undefined,
        participation: body.participation != null ? Number(body.participation) : undefined,
        notes: body.notes != null ? String(body.notes) : undefined,
      },
    });
    return NextResponse.json({ campaign });
  }

  if (action === "issue_certificate") {
    const cert = await prisma.medicalCertificate.create({
      data: {
        companyId: profile.id,
        employeeId: body.employeeId || null,
        employeeName: String(body.employeeName),
        type: String(body.type || "fitness"),
        validUntil: body.validUntil ? new Date(body.validUntil) : null,
        notes: body.notes ? String(body.notes) : null,
      },
    });
    await audit(session.id, "corporate.certificate", "MedicalCertificate", cert.id);
    return NextResponse.json({ certificate: cert });
  }

  if (action === "sick_leave") {
    const record = await prisma.sickLeaveRecord.create({
      data: {
        companyId: profile.id,
        employeeId: body.employeeId || null,
        employeeName: String(body.employeeName),
        startDate: new Date(body.startDate || Date.now()),
        endDate: body.endDate ? new Date(body.endDate) : null,
        reason: body.reason ? String(body.reason) : null,
        status: String(body.status || "open"),
      },
    });
    return NextResponse.json({ sickLeave: record });
  }

  if (action === "close_sick_leave") {
    const record = await prisma.sickLeaveRecord.update({
      where: { id: String(body.id) },
      data: { status: "closed", endDate: body.endDate ? new Date(body.endDate) : new Date() },
    });
    return NextResponse.json({ sickLeave: record });
  }

  if (action === "generate_report") {
    const employees = await prisma.corporateEmployee.findMany({ where: { companyId: profile.id } });
    const campaigns = await prisma.corporateCampaign.findMany({ where: { companyId: profile.id } });
    const vaccinated = employees.filter((e) => e.vaccinatedAt).length;
    const checkedUp = employees.filter((e) => e.lastCheckupAt).length;
    const summary = [
      `Corporate health report — ${profile.name}`,
      `Employees: ${employees.length}`,
      `Vaccination rate: ${employees.length ? Math.round((vaccinated / employees.length) * 100) : 0}%`,
      `Checkup participation: ${employees.length ? Math.round((checkedUp / employees.length) * 100) : 0}%`,
      `Campaigns: ${campaigns.length}`,
      `Insurance: ${profile.insuranceSupport || "n/a"}`,
      `Generated: ${new Date().toISOString()}`,
    ].join("\n");
    await prisma.companyProfile.update({
      where: { id: profile.id },
      data: { medicalReports: summary },
    });
    await sendEmail({
      to: session.email,
      userId: session.id,
      subject: `Corporate report — ${profile.name}`,
      body: summary,
    });
    return NextResponse.json({ ok: true, report: summary });
  }

  if (action === "vaccination_reminder" || action === "campaign_notify") {
    const employees = await prisma.corporateEmployee.findMany({
      where: { companyId: profile.id, status: "active" },
    });
    const message = String(body.message || "Health campaign reminder from your employer.");
    let sent = 0;
    for (const emp of employees.slice(0, 50)) {
      await sendEmail({
        to: emp.email,
        subject: "MedCare corporate health reminder",
        body: `${message}\n\nCampaign: ${body.campaignId || "general"}\nEmployee: ${emp.name}`,
      });
      sent += 1;
    }
    await sendEmail({
      to: session.email,
      userId: session.id,
      subject: "Vaccination reminder broadcast",
      body: `Sent to ${sent} employees.\n\n${message}`,
    });
    return NextResponse.json({ ok: true, message: `Reminder sent to ${sent} employees` });
  }

  if (action === "update_insurance") {
    const updated = await prisma.companyProfile.update({
      where: { id: profile.id },
      data: { insuranceSupport: String(body.insuranceSupport || "") },
    });
    return NextResponse.json({ profile: updated });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
