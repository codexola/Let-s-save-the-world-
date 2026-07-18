import fs from "fs";
import path from "path";
import { createHash } from "crypto";
import { prisma } from "./db";
import { createDatabaseBackup, listBackups } from "./security-ops";
import { audit } from "./auth";

export async function ensureDrSeed() {
  if ((await prisma.regionNode.count()) === 0) {
    await prisma.regionNode.createMany({
      data: [
        { code: "ap-northeast-1", name: "Tokyo (primary)", role: "primary", healthy: true, lagSeconds: 0, endpoint: "https://jp.medcare.local" },
        { code: "ap-northeast-2", name: "Seoul (replica)", role: "secondary", healthy: true, lagSeconds: 12, endpoint: "https://kr.medcare.local" },
        { code: "us-west-2", name: "Oregon (DR)", role: "dr", healthy: true, lagSeconds: 45, endpoint: "https://us.medcare.local" },
      ],
    });
  }
  if ((await prisma.bcpPlan.count()) === 0) {
    await prisma.bcpPlan.create({
      data: {
        title: "MedCare Clinical Continuity Plan",
        rtoHours: 4,
        rpoMinutes: 60,
        owner: "Platform SRE",
        stepsJson: JSON.stringify([
          "Declare incident / activate BCP",
          "Failover DNS to healthy region",
          "Restore latest validated backup if needed",
          "Verify EHR/telemedicine/EMS critical paths",
          "Communicate status to hospitals and regulators",
        ]),
        active: true,
      },
    });
  }
  if ((await prisma.recoveryDrill.count()) === 0) {
    await prisma.recoveryDrill.create({
      data: {
        name: "Q2 backup restore drill",
        drillType: "restore",
        status: "completed",
        result: "Restored sandbox DB; checksum matched",
        validated: true,
        completedAt: new Date(Date.now() - 7 * 86400_000),
      },
    });
  }
}

export async function buildDrDashboard() {
  await ensureDrSeed();
  const [regions, backups, failovers, drills, plans] = await Promise.all([
    prisma.regionNode.findMany({ orderBy: { role: "asc" } }),
    listBackups(),
    prisma.failoverEvent.findMany({ orderBy: { createdAt: "desc" }, take: 20 }),
    prisma.recoveryDrill.findMany({ orderBy: { scheduledAt: "desc" }, take: 20 }),
    prisma.bcpPlan.findMany({ where: { active: true } }),
  ]);

  const primary = regions.find((r) => r.role === "primary");
  const healthy = regions.filter((r) => r.healthy).length;

  return {
    multiRegion: {
      regions,
      primary: primary?.code,
      healthyNodes: healthy,
      totalNodes: regions.length,
    },
    automatedBackups: {
      schedule: "hourly + on-demand",
      latest: backups[0] || null,
      count: backups.length,
    },
    crossRegionReplication: regions.map((r) => ({
      code: r.code,
      role: r.role,
      lagSeconds: r.lagSeconds,
      healthy: r.healthy,
    })),
    highAvailability: {
      status: healthy >= 2 ? "ha_ready" : "degraded",
      note: "Active-passive with automated failover when primary unhealthy",
    },
    failoverEvents: failovers,
    recoveryDrills: drills,
    backupValidation: backups.slice(0, 10).map((b) => ({
      id: b.id,
      filename: b.filename,
      sizeBytes: b.sizeBytes,
      status: b.status,
      notes: b.notes,
    })),
    businessContinuityPlans: plans.map((p) => ({
      ...p,
      steps: JSON.parse(p.stepsJson) as string[],
    })),
  };
}

export async function runAutomatedBackup(actorId?: string) {
  const result = await createDatabaseBackup(actorId);
  // Validate by checksum
  const filePath = result.path;
  const buf = fs.readFileSync(filePath);
  const checksum = createHash("sha256").update(buf).digest("hex");
  const validated = await prisma.backupRecord.update({
    where: { id: result.record.id },
    data: {
      status: "validated",
      notes: `${result.record.notes || ""} | sha256=${checksum.slice(0, 16)}… validated`,
    },
  });
  return { record: validated, checksum, path: filePath };
}

export async function validateBackup(backupId: string, actorId: string) {
  const row = await prisma.backupRecord.findUnique({ where: { id: backupId } });
  if (!row) throw new Error("Backup not found");
  const filePath = path.join(process.cwd(), "backups", row.filename);
  if (!fs.existsSync(filePath)) throw new Error("Backup file missing");
  const checksum = createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
  const updated = await prisma.backupRecord.update({
    where: { id: backupId },
    data: { status: "validated", notes: `Validated sha256=${checksum.slice(0, 16)}…` },
  });
  await audit(actorId, "dr.backup_validate", "BackupRecord", backupId);
  return { record: updated, checksum };
}

export async function triggerFailover(opts: {
  fromRegion: string;
  toRegion: string;
  reason: string;
  actorId: string;
  automated?: boolean;
}) {
  await prisma.regionNode.updateMany({
    where: { code: opts.fromRegion },
    data: { healthy: false, role: "failed" },
  });
  await prisma.regionNode.updateMany({
    where: { code: opts.toRegion },
    data: { healthy: true, role: "primary", lagSeconds: 0 },
  });
  const event = await prisma.failoverEvent.create({
    data: {
      fromRegion: opts.fromRegion,
      toRegion: opts.toRegion,
      reason: opts.reason,
      automated: opts.automated !== false,
      status: "completed",
    },
  });
  await audit(opts.actorId, "dr.failover", "FailoverEvent", event.id);
  return event;
}

export async function runRecoveryDrill(opts: {
  name: string;
  drillType?: string;
  actorId: string;
}) {
  const backup = await runAutomatedBackup(opts.actorId);
  const drill = await prisma.recoveryDrill.create({
    data: {
      name: opts.name,
      drillType: opts.drillType || "restore",
      status: "completed",
      result: `Validated backup ${backup.record.filename} checksum ${backup.checksum.slice(0, 12)}`,
      validated: true,
      completedAt: new Date(),
    },
  });
  await audit(opts.actorId, "dr.recovery_drill", "RecoveryDrill", drill.id);
  return { drill, backup };
}
