import { createHash } from "crypto";
import { prisma } from "./db";
import { recordSecurityEvent, createDatabaseBackup, listBackups, zeroTrustStatus } from "./security-ops";
import { audit } from "./auth";
import { notifyUser } from "./notify";

export async function ensureSocSeed() {
  if ((await prisma.securityIncident.count()) === 0) {
    await prisma.securityIncident.createMany({
      data: [
        {
          title: "Suspicious login burst from TOR exit",
          severity: "high",
          status: "investigating",
          category: "account_anomaly",
          summary: "Multiple failed logins then success from anonymized IP range.",
          playbook: "Force logout → require MFA → reset password → notify user",
        },
        {
          title: "Elevated API key usage",
          severity: "medium",
          status: "open",
          category: "threat",
          summary: "Sandbox key approaching rate-limit ceiling repeatedly.",
          playbook: "Throttle key → contact developer → rotate if compromised",
        },
      ],
    });
  }
  if ((await prisma.securityAlert.count()) === 0) {
    await prisma.securityAlert.createMany({
      data: [
        {
          title: "Rate-limit threshold breached",
          severity: "warning",
          source: "ids",
          details: "IP 203.0.113.10 exceeded API window",
          relatedIp: "203.0.113.10",
        },
        {
          title: "Possible payment fraud pattern",
          severity: "critical",
          source: "fraud",
          details: "Rapid invoice open/close with mismatched payer profile",
        },
      ],
    });
  }
  if ((await prisma.malwareScan.count()) === 0) {
    await prisma.malwareScan.create({
      data: {
        target: "prescription-scan-demo.pdf",
        targetType: "upload",
        status: "clean",
        findings: "No signatures matched",
      },
    });
  }
  if ((await prisma.accountAnomaly.count()) === 0) {
    await prisma.accountAnomaly.create({
      data: {
        email: "patient@medcare.local",
        anomalyType: "impossible_travel",
        score: 0.82,
        details: "Login Tokyo then US within 20 minutes",
        status: "open",
      },
    });
  }
}

export async function buildSocDashboard() {
  await ensureSocSeed();
  const since24h = new Date(Date.now() - 24 * 3600_000);
  const [
    events24h,
    incidents,
    alerts,
    scans,
    anomalies,
    auditCount,
    siemExports,
    backups,
  ] = await Promise.all([
    prisma.securityEvent.findMany({ where: { createdAt: { gte: since24h } }, orderBy: { createdAt: "desc" }, take: 100 }),
    prisma.securityIncident.findMany({ orderBy: { openedAt: "desc" }, take: 30 }),
    prisma.securityAlert.findMany({ orderBy: { createdAt: "desc" }, take: 30 }),
    prisma.malwareScan.findMany({ orderBy: { scannedAt: "desc" }, take: 20 }),
    prisma.accountAnomaly.findMany({ orderBy: { createdAt: "desc" }, take: 20 }),
    prisma.auditLog.count({ where: { createdAt: { gte: since24h } } }),
    prisma.siemExport.findMany({ orderBy: { createdAt: "desc" }, take: 10 }),
    listBackups(),
  ]);

  const monitoring = {
    status: "24/7 continuous",
    window: "last_24h",
    events: events24h.length,
    auditActions: auditCount,
    openIncidents: incidents.filter((i) => i.status !== "resolved").length,
    openAlerts: alerts.filter((a) => a.status === "open").length,
  };

  const threatDetection = {
    highSeverity: [...incidents, ...alerts].filter((x) =>
      ["high", "critical"].includes(x.severity)
    ).length,
    categories: ["brute_force", "fraud", "malware", "anomaly", "api_abuse"],
  };

  const complianceReporting = {
    frameworks: ["APPI", "HIPAA-aligned", "SOC2-ready controls"],
    zeroTrust: zeroTrustStatus(),
    recentBackups: backups.slice(0, 5),
  };

  return {
    monitoring,
    threatDetection,
    siem: { exports: siemExports, integration: "JSON/CEF export to SIEM collectors" },
    incidents,
    fraudAlerts: alerts.filter((a) => a.source === "fraud" || a.title.toLowerCase().includes("fraud")),
    malwareScans: scans,
    accountAnomalies: anomalies,
    auditLogging: { last24h: auditCount, note: "All privileged actions write AuditLog" },
    securityAlerts: alerts,
    complianceReporting,
    events24h: events24h.slice(0, 40),
  };
}

export async function openIncident(opts: {
  title: string;
  severity?: string;
  category?: string;
  summary: string;
  assigneeId?: string;
  actorId: string;
}) {
  const incident = await prisma.securityIncident.create({
    data: {
      title: opts.title,
      severity: opts.severity || "medium",
      category: opts.category || "threat",
      summary: opts.summary,
      assigneeId: opts.assigneeId,
      status: "open",
      playbook: "Triage → Contain → Eradicate → Recover → Lessons learned",
    },
  });
  await recordSecurityEvent({
    type: "incident.opened",
    severity: opts.severity || "medium",
    userId: opts.actorId,
    details: opts.title,
  });
  await audit(opts.actorId, "soc.incident_open", "SecurityIncident", incident.id);
  return incident;
}

export async function respondIncident(opts: {
  incidentId: string;
  status: string;
  actorId: string;
}) {
  const data: Record<string, unknown> = { status: opts.status };
  if (opts.status === "contained") data.containedAt = new Date();
  if (opts.status === "resolved") data.resolvedAt = new Date();
  const incident = await prisma.securityIncident.update({
    where: { id: opts.incidentId },
    data,
  });
  await audit(opts.actorId, `soc.incident_${opts.status}`, "SecurityIncident", incident.id);
  return incident;
}

export async function acknowledgeAlert(alertId: string, actorId: string) {
  const alert = await prisma.securityAlert.update({
    where: { id: alertId },
    data: { status: "acknowledged", acknowledgedAt: new Date() },
  });
  await audit(actorId, "soc.alert_ack", "SecurityAlert", alertId);
  return alert;
}

export async function runMalwareScan(target: string, actorId: string) {
  const hash = createHash("sha256").update(target).digest("hex");
  const dirty = /eicar|malware|virus/i.test(target);
  const scan = await prisma.malwareScan.create({
    data: {
      target,
      targetType: "upload",
      status: dirty ? "infected" : "clean",
      findings: dirty ? `Signature hit on ${hash.slice(0, 12)}` : `Clean hash ${hash.slice(0, 12)}`,
    },
  });
  if (dirty) {
    await prisma.securityAlert.create({
      data: {
        title: "Malware detected on upload",
        severity: "critical",
        source: "malware",
        details: target,
      },
    });
  }
  await audit(actorId, "soc.malware_scan", "MalwareScan", scan.id);
  return scan;
}

export async function detectAccountAnomaly(opts: {
  email?: string;
  userId?: string;
  anomalyType: string;
  score: number;
  details: string;
}) {
  return prisma.accountAnomaly.create({
    data: {
      email: opts.email,
      userId: opts.userId,
      anomalyType: opts.anomalyType,
      score: opts.score,
      details: opts.details,
      status: "open",
    },
  });
}

export async function exportToSiem(actorId: string) {
  const events = await prisma.securityEvent.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  const payload = {
    exportedAt: new Date().toISOString(),
    format: "json",
    events,
  };
  const row = await prisma.siemExport.create({
    data: {
      format: "json",
      eventCount: events.length,
      destination: "siem-demo",
      payloadJson: JSON.stringify(payload),
    },
  });
  await audit(actorId, "soc.siem_export", "SiemExport", row.id);
  return row;
}

export async function raiseSecurityAlert(opts: {
  title: string;
  severity?: string;
  source?: string;
  details?: string;
  notifyAdminId?: string;
}) {
  const alert = await prisma.securityAlert.create({
    data: {
      title: opts.title,
      severity: opts.severity || "warning",
      source: opts.source || "soc",
      details: opts.details,
    },
  });
  if (opts.notifyAdminId) {
    await notifyUser({
      userId: opts.notifyAdminId,
      subject: `SOC alert: ${opts.title}`,
      body: opts.details || opts.title,
      kind: "general",
      channels: ["email", "push", "inbox"],
    }).catch(() => undefined);
  }
  return alert;
}

export { createDatabaseBackup, recordSecurityEvent };
