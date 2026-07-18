import fs from "fs";
import path from "path";
import { prisma } from "./db";
import { audit } from "./auth";

export async function recordSecurityEvent(opts: {
  type: string;
  severity?: string;
  ip?: string | null;
  path?: string | null;
  userId?: string | null;
  details?: string;
}) {
  return prisma.securityEvent.create({
    data: {
      type: opts.type,
      severity: opts.severity || "info",
      ip: opts.ip || null,
      path: opts.path || null,
      userId: opts.userId || null,
      details: opts.details || null,
    },
  });
}

/** Copy SQLite DB into backups/ — local disaster-recovery snapshot */
export async function createDatabaseBackup(createdBy?: string) {
  const dbUrl = process.env.DATABASE_URL || "file:./dev.db";
  const fileMatch = dbUrl.replace(/^file:/, "");
  const dbPath = path.isAbsolute(fileMatch)
    ? fileMatch
    : path.join(process.cwd(), "prisma", path.basename(fileMatch) === fileMatch ? fileMatch : fileMatch.replace(/^\.\//, ""));

  // Prefer prisma/dev.db used by the app
  const candidates = [
    path.join(process.cwd(), "prisma", "dev.db"),
    dbPath,
  ];
  const source = candidates.find((p) => fs.existsSync(p));
  if (!source) {
    throw new Error("Database file not found for backup");
  }

  const backupDir = path.join(process.cwd(), "backups");
  fs.mkdirSync(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `medcare-backup-${stamp}.db`;
  const dest = path.join(backupDir, filename);
  fs.copyFileSync(source, dest);
  const sizeBytes = fs.statSync(dest).size;

  const record = await prisma.backupRecord.create({
    data: {
      filename,
      sizeBytes,
      status: "completed",
      notes: `Disaster recovery snapshot from ${source}`,
      createdBy: createdBy || null,
    },
  });

  if (createdBy) {
    await audit(createdBy, "security.backup", "BackupRecord", record.id);
  }

  return { record, path: dest };
}

export async function listBackups() {
  return prisma.backupRecord.findMany({ orderBy: { createdAt: "desc" }, take: 50 });
}

/** Zero Trust posture summary for admin/security UI */
export function zeroTrustStatus() {
  return {
    tls: {
      enforcedAtEdge: process.env.NODE_ENV === "production",
      note: "TLS terminated at reverse proxy / hosting edge (HTTPS). App sets Secure cookies in production.",
    },
    encryption: {
      algorithm: "AES-256-GCM",
      chatMessages: true,
      sensitiveFields: true,
    },
    rbac: true,
    mfa: true,
    auditLogs: true,
    rateLimiting: true,
    intrusionDetection: true,
    ddosProtection: {
      appLayerRateLimit: true,
      edgeWafRecommended: true,
      note: "Pair with CDN/WAF for volumetric DDoS; app enforces per-IP API rate limits.",
    },
    backup: true,
    disasterRecovery: {
      localSnapshots: true,
      runbook: "Create backup via Admin → Security, store off-site, restore by replacing prisma/dev.db and restarting.",
    },
    zeroTrust: {
      continuousSessionValidation: true,
      leastPrivilegeRbac: true,
      denyByDefaultRoutes: true,
      secureCookies: true,
      note: "Every protected request re-validates JWT; permissions checked at API layer; sensitive actions audited.",
    },
  };
}
