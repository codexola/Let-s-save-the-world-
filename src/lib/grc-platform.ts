import { prisma } from "./db";
import { audit } from "./auth";
import {
  ensureDefaultRetentionPolicies,
  CONSENT_TYPES,
  PRIVACY_POLICY_VERSION,
} from "./privacy";

export async function ensureGrcExtensionsSeed() {
  await ensureDefaultRetentionPolicies();
  if ((await prisma.compliancePolicy.count()) === 0) {
    await prisma.compliancePolicy.createMany({
      data: [
        {
          code: "POL-CONSENT",
          title: "Patient consent & purpose limitation",
          framework: "APPI/GDPR",
          body: "Collect only with lawful basis; purpose-bind processing; honor withdrawal.",
          version: "2026.1",
        },
        {
          code: "POL-ACCESS",
          title: "Minimum necessary access",
          framework: "HIPAA-aligned",
          body: "Role-based access; break-glass audited; PHI access logged.",
          version: "2026.1",
        },
        {
          code: "POL-RETENTION",
          title: "Records retention",
          framework: "APPI/GDPR",
          body: "Apply retention schedules; anonymize or erase after retainDays.",
          version: "2026.1",
        },
      ],
    });
  }
  if ((await prisma.accessControlPolicy.count()) === 0) {
    await prisma.accessControlPolicy.createMany({
      data: [
        {
          name: "EHR read clinicians",
          resource: "ehr",
          effect: "allow",
          rolesJson: JSON.stringify(["DOCTOR", "NURSE", "ADMIN"]),
          conditions: "treatment relationship or hospital affiliation",
        },
        {
          name: "Billing finance",
          resource: "billing",
          effect: "allow",
          rolesJson: JSON.stringify(["ADMIN", "HOSPITAL", "COMPANY"]),
        },
        {
          name: "Deny archive for admin",
          resource: "archive",
          effect: "deny",
          rolesJson: JSON.stringify(["ADMIN"]),
          conditions: "developer-only archive controls",
        },
      ],
    });
  }
  if ((await prisma.vendorRisk.count()) === 0) {
    await prisma.vendorRisk.createMany({
      data: [
        { vendorName: "Cloud Hosting Provider", category: "infra", riskScore: 35, status: "accepted", notes: "SOC2 Type II on file" },
        { vendorName: "SMS Gateway", category: "comms", riskScore: 55, status: "monitored", notes: "PHI minimized in templates" },
        { vendorName: "Imaging CDN", category: "saas", riskScore: 40, status: "monitored", notes: "Signed URLs + TLS" },
      ],
    });
  }
  if ((await prisma.dataLineageEdge.count()) === 0) {
    await prisma.dataLineageEdge.createMany({
      data: [
        { source: "WearableConnection", target: "HealthMetric", dataType: "vitals", transform: "normalize_units" },
        { source: "HealthMetric", target: "RpmDailyScore", dataType: "vitals", transform: "score_pipeline" },
        { source: "ElectronicHealthRecord", target: "AiConsultation", dataType: "clinical", transform: "consent_gated_context" },
        { source: "LaboratoryOrder", target: "ElectronicHealthRecord", dataType: "lab", transform: "result_ingest" },
        { source: "Invoice", target: "AnalyticsSnapshot", dataType: "finance", transform: "aggregate_revenue" },
        { source: "Consent", target: "ApiV1MedicalRecords", dataType: "authorization", transform: "consent_check" },
      ],
    });
  }
  if ((await prisma.internalAudit.count()) === 0) {
    await prisma.internalAudit.createMany({
      data: [
        {
          title: "Access control sample audit",
          scope: "EHR and billing permissions",
          status: "in_progress",
          owner: "Compliance",
          dueAt: new Date(Date.now() + 14 * 86400_000),
        },
        {
          title: "Vendor risk annual review",
          scope: "Top 10 processors",
          status: "planned",
          owner: "GRC",
          dueAt: new Date(Date.now() + 45 * 86400_000),
        },
      ],
    });
  }
}

export async function buildGrcDashboard() {
  await ensureGrcExtensionsSeed();
  const [
    policies,
    accessPolicies,
    vendors,
    lineage,
    audits,
    reports,
    retention,
    consentsGranted,
    openDsrs,
    accessLogs,
    auditCount,
  ] = await Promise.all([
    prisma.compliancePolicy.findMany({ orderBy: { code: "asc" } }),
    prisma.accessControlPolicy.findMany({ orderBy: { name: "asc" } }),
    prisma.vendorRisk.findMany({ orderBy: { riskScore: "desc" } }),
    prisma.dataLineageEdge.findMany({ orderBy: { source: "asc" } }),
    prisma.internalAudit.findMany({ orderBy: { createdAt: "desc" } }),
    prisma.regulatoryReport.findMany({ orderBy: { generatedAt: "desc" }, take: 10 }),
    prisma.retentionPolicy.findMany({ orderBy: { resource: "asc" } }),
    prisma.consent.count({ where: { granted: true, withdrawnAt: null } }),
    prisma.dataSubjectRequest.count({ where: { status: "open" } }),
    prisma.accessLog.count(),
    prisma.auditLog.count(),
  ]);

  return {
    consentManagement: { catalog: CONSENT_TYPES, granted: consentsGranted, policyVersion: PRIVACY_POLICY_VERSION },
    privacyPreferences: {
      note: "Locale, notification channels, and consent types drive processing preferences",
      channels: ["email", "sms", "push", "line"],
    },
    accessControlPolicies: accessPolicies.map((p) => ({
      ...p,
      roles: JSON.parse(p.rolesJson) as string[],
    })),
    retentionSchedules: retention,
    regulatoryReporting: reports,
    internalAudits: audits,
    vendorRiskManagement: vendors,
    dataLineage: lineage,
    policyManagement: policies,
    complianceDashboard: {
      frameworks: ["APPI", "HIPAA-aligned", "GDPR"],
      stats: { consentsGranted, openDsrs, accessLogs, auditCount, vendors: vendors.length, openAudits: audits.filter((a) => a.status !== "completed").length },
      maturity: "controls_implemented_with_evidence",
    },
  };
}

export async function generateRegulatoryReport(opts: {
  framework: string;
  period: string;
  actorId: string;
}) {
  const dash = await buildGrcDashboard();
  const payload = {
    framework: opts.framework,
    period: opts.period,
    generatedAt: new Date().toISOString(),
    dashboard: dash.complianceDashboard,
    retention: dash.retentionSchedules.map((r) => ({ resource: r.resource, retainDays: r.retainDays })),
    vendors: dash.vendorRiskManagement.map((v) => ({ name: v.vendorName, score: v.riskScore })),
  };
  const report = await prisma.regulatoryReport.create({
    data: {
      title: `${opts.framework} regulatory report — ${opts.period}`,
      framework: opts.framework,
      period: opts.period,
      status: "filed",
      payloadJson: JSON.stringify(payload),
    },
  });
  await audit(opts.actorId, "grc.regulatory_report", "RegulatoryReport", report.id);
  return report;
}

export async function upsertCompliancePolicy(opts: {
  code: string;
  title: string;
  framework: string;
  body: string;
  actorId: string;
}) {
  const policy = await prisma.compliancePolicy.upsert({
    where: { code: opts.code },
    update: { title: opts.title, framework: opts.framework, body: opts.body },
    create: {
      code: opts.code,
      title: opts.title,
      framework: opts.framework,
      body: opts.body,
    },
  });
  await audit(opts.actorId, "grc.policy_upsert", "CompliancePolicy", policy.id);
  return policy;
}
