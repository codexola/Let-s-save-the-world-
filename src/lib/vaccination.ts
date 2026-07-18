import { randomBytes } from "crypto";
import { prisma } from "./db";
import { notifyUser } from "./notify";
import { audit } from "./auth";

export const VACCINE_CATALOG = [
  { name: "Influenza", category: "routine", totalDoses: 1, boosterMonths: 12 },
  { name: "COVID-19", category: "routine", totalDoses: 2, boosterMonths: 6 },
  { name: "Tdap", category: "routine", totalDoses: 1, boosterMonths: 120 },
  { name: "MMR", category: "routine", totalDoses: 2, boosterMonths: null },
  { name: "Hepatitis B", category: "routine", totalDoses: 3, boosterMonths: null },
  { name: "HPV", category: "school", totalDoses: 2, boosterMonths: null },
  { name: "Yellow Fever", category: "travel", totalDoses: 1, boosterMonths: 120 },
  { name: "Typhoid", category: "travel", totalDoses: 1, boosterMonths: 24 },
  { name: "Hepatitis A", category: "travel", totalDoses: 2, boosterMonths: null },
  { name: "Pneumococcal", category: "routine", totalDoses: 1, boosterMonths: null },
  { name: "Shingles (RZV)", category: "routine", totalDoses: 2, boosterMonths: null },
  { name: "Corporate Influenza", category: "corporate", totalDoses: 1, boosterMonths: 12 },
] as const;

export async function ensureVaccinationSeed(userId: string, companyUserId?: string) {
  const count = await prisma.vaccinationRecord.count({ where: { userId } });
  if (count > 0) return;

  const flu = await prisma.vaccinationRecord.create({
    data: {
      userId,
      vaccineName: "Influenza",
      category: "routine",
      doseNumber: 1,
      totalDoses: 1,
      administeredAt: new Date(Date.now() - 120 * 86400_000),
      boosterDueAt: new Date(Date.now() + 240 * 86400_000),
      status: "completed",
      provider: "Tokyo Central Hospital",
      lotNumber: "FLU-2025-A1",
      site: "Left deltoid",
    },
  });
  await prisma.vaccinationRecord.create({
    data: {
      userId,
      vaccineName: "COVID-19",
      category: "routine",
      doseNumber: 2,
      totalDoses: 2,
      administeredAt: new Date(Date.now() - 200 * 86400_000),
      boosterDueAt: new Date(Date.now() + 30 * 86400_000),
      status: "completed",
      provider: "MedCare Clinic",
      lotNumber: "COV-B2",
    },
  });
  await prisma.vaccinationRecord.create({
    data: {
      userId,
      vaccineName: "Hepatitis A",
      category: "travel",
      doseNumber: 1,
      totalDoses: 2,
      dueAt: new Date(Date.now() + 14 * 86400_000),
      status: "upcoming",
      notes: "Travel series — dose 1 due before trip",
    },
  });
  await prisma.vaccinationRecord.create({
    data: {
      userId,
      vaccineName: "HPV",
      category: "school",
      doseNumber: 1,
      totalDoses: 2,
      dueAt: new Date(Date.now() + 45 * 86400_000),
      status: "upcoming",
      notes: "School vaccination program",
    },
  });

  await issueCertificate(flu.id, userId);

  let campaignOwner = companyUserId;
  if (!campaignOwner) {
    const co = await prisma.user.findFirst({ where: { role: "COMPANY" } });
    campaignOwner = co?.id;
  }
  if (campaignOwner) {
    const campaign = await prisma.vaccinationCampaign.create({
      data: {
        ownerId: campaignOwner,
        name: "2026 Corporate Flu Campaign",
        type: "corporate",
        vaccineName: "Corporate Influenza",
        description: "Workplace influenza vaccination drive",
        targetGroup: "All employees",
        startDate: new Date(),
        endDate: new Date(Date.now() + 60 * 86400_000),
        status: "active",
      },
    });
    await prisma.vaccinationRecord.create({
      data: {
        userId,
        vaccineName: "Corporate Influenza",
        category: "corporate",
        doseNumber: 1,
        totalDoses: 1,
        dueAt: new Date(Date.now() + 7 * 86400_000),
        status: "upcoming",
        campaignId: campaign.id,
        notes: "Corporate campaign enrollment",
      },
    });
    await prisma.vaccinationCampaign.create({
      data: {
        ownerId: campaignOwner,
        name: "School MMR catch-up",
        type: "school",
        vaccineName: "MMR",
        description: "School vaccination catch-up clinic",
        targetGroup: "Students",
        status: "active",
      },
    });
  }
}

export async function recordVaccination(opts: {
  userId: string;
  vaccineName: string;
  category?: string;
  doseNumber?: number;
  totalDoses?: number;
  administeredAt?: Date | null;
  dueAt?: Date | null;
  familyMemberId?: string;
  provider?: string;
  lotNumber?: string;
  site?: string;
  campaignId?: string;
  notes?: string;
}) {
  const catalog = VACCINE_CATALOG.find((v) => v.name === opts.vaccineName);
  const administeredAt = opts.administeredAt ?? (opts.dueAt ? null : new Date());
  let boosterDueAt: Date | null = null;
  if (administeredAt && catalog?.boosterMonths) {
    boosterDueAt = new Date(administeredAt);
    boosterDueAt.setMonth(boosterDueAt.getMonth() + catalog.boosterMonths);
  }
  const record = await prisma.vaccinationRecord.create({
    data: {
      userId: opts.userId,
      familyMemberId: opts.familyMemberId,
      vaccineName: opts.vaccineName,
      category: opts.category || catalog?.category || "routine",
      doseNumber: opts.doseNumber || 1,
      totalDoses: opts.totalDoses || catalog?.totalDoses || 1,
      administeredAt,
      dueAt: opts.dueAt || null,
      boosterDueAt,
      provider: opts.provider,
      lotNumber: opts.lotNumber,
      site: opts.site,
      campaignId: opts.campaignId,
      notes: opts.notes,
      status: administeredAt ? "completed" : "upcoming",
    },
  });
  await audit(opts.userId, "vaccination.record", "VaccinationRecord", record.id);
  return record;
}

export async function issueCertificate(recordId: string, userId: string) {
  const record = await prisma.vaccinationRecord.findUnique({ where: { id: recordId } });
  if (!record || record.userId !== userId) throw new Error("Record not found");
  if (!record.administeredAt) throw new Error("Cannot certify incomplete vaccination");
  const publicCode = `VC-${randomBytes(4).toString("hex").toUpperCase()}`;
  const cert = await prisma.vaccinationCertificate.create({
    data: {
      userId,
      recordId,
      publicCode,
      expiresAt: record.boosterDueAt || new Date(Date.now() + 365 * 86400_000),
      payloadJson: JSON.stringify({
        vaccine: record.vaccineName,
        dose: `${record.doseNumber}/${record.totalDoses}`,
        administeredAt: record.administeredAt,
        provider: record.provider,
        lot: record.lotNumber,
      }),
    },
  });
  return cert;
}

export async function sendVaccinationReminders(userId?: string) {
  const now = new Date();
  const soon = new Date(now.getTime() + 14 * 86400_000);
  const upcoming = await prisma.vaccinationRecord.findMany({
    where: {
      status: { in: ["upcoming", "due"] },
      dueAt: { gte: now, lte: soon },
      ...(userId ? { userId } : {}),
    },
    take: 100,
  });
  const boosters = await prisma.vaccinationRecord.findMany({
    where: {
      status: "completed",
      boosterDueAt: { gte: now, lte: soon },
      ...(userId ? { userId } : {}),
    },
    take: 100,
  });
  let sent = 0;
  for (const r of [...upcoming, ...boosters]) {
    await notifyUser({
      userId: r.userId,
      subject: "Vaccination reminder",
      body: `${r.vaccineName} ${r.status === "completed" ? "booster" : "dose"} due ${
        (r.dueAt || r.boosterDueAt)?.toLocaleDateString() || "soon"
      }.`,
      kind: "reminder",
      channels: ["email", "push", "sms"],
    }).catch(() => undefined);
    sent += 1;
  }
  return sent;
}

export async function vaccinationDashboard(userId: string) {
  await ensureVaccinationSeed(userId);
  const history = await prisma.vaccinationRecord.findMany({
    where: { userId, status: "completed" },
    orderBy: { administeredAt: "desc" },
  });
  const upcoming = await prisma.vaccinationRecord.findMany({
    where: { userId, status: { in: ["upcoming", "due"] } },
    orderBy: { dueAt: "asc" },
  });
  const boosters = await prisma.vaccinationRecord.findMany({
    where: { userId, status: "completed", boosterDueAt: { not: null } },
    orderBy: { boosterDueAt: "asc" },
  });
  const certificates = await prisma.vaccinationCertificate.findMany({
    where: { userId },
    include: { record: true },
    orderBy: { issuedAt: "desc" },
  });
  const campaigns = await prisma.vaccinationCampaign.findMany({
    where: { status: "active" },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  return {
    catalog: VACCINE_CATALOG,
    history,
    upcoming,
    boosterSchedule: boosters,
    certificates,
    campaigns,
    travel: [...history, ...upcoming].filter((r) => r.category === "travel"),
    school: [...history, ...upcoming].filter((r) => r.category === "school"),
    corporate: [...history, ...upcoming].filter((r) => r.category === "corporate"),
  };
}
