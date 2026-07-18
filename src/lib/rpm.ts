import { prisma } from "./db";
import { notifyUser } from "./notify";
import { audit } from "./auth";

export const RPM_MONITORS = [
  "blood_pressure",
  "heart_rate",
  "blood_sugar",
  "temperature",
  "ecg",
  "weight",
  "sleep",
  "medication_adherence",
] as const;

const DEFAULT_THRESHOLDS = {
  heart_rate: { low: 50, high: 120 },
  blood_pressure_systolic: { low: 90, high: 160 },
  blood_pressure_diastolic: { low: 50, high: 100 },
  blood_sugar: { low: 70, high: 180 },
  temperature: { low: 35.5, high: 38.5 },
  ecg_hr: { low: 50, high: 120 },
  weight: { low: 40, high: 150 },
  sleep: { low: 4, high: 12 },
  medication_adherence: { low: 60, high: 100 },
};

function dateKey(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

async function latestMetric(userId: string, type: string) {
  return prisma.healthMetric.findFirst({
    where: { userId, type },
    orderBy: { recordedAt: "desc" },
  });
}

export async function ensureRpmEnrollment(userId: string, doctorId?: string) {
  return prisma.rpmEnrollment.upsert({
    where: { userId },
    update: {
      active: true,
      ...(doctorId ? { doctorId } : {}),
    },
    create: {
      userId,
      doctorId,
      active: true,
      thresholdsJson: JSON.stringify(DEFAULT_THRESHOLDS),
      monitorsJson: JSON.stringify(RPM_MONITORS),
    },
  });
}

export async function computeDailyHealthScore(userId: string) {
  const types = [
    "heart_rate",
    "blood_pressure_systolic",
    "blood_sugar",
    "temperature",
    "sleep",
    "medication_adherence",
    "weight",
    "ecg_hr",
  ];
  const breakdown: Record<string, number> = {};
  let total = 0;
  let n = 0;

  for (const type of types) {
    const m = await latestMetric(userId, type);
    const thr = DEFAULT_THRESHOLDS[type as keyof typeof DEFAULT_THRESHOLDS];
    if (!m || !thr) continue;
    let pts = 100;
    if (m.value < thr.low || m.value > thr.high) pts = 40;
    else if (m.value < thr.low * 1.05 || m.value > thr.high * 0.95) pts = 70;
    breakdown[type] = pts;
    total += pts;
    n += 1;
  }

  const score = n ? Math.round(total / n) : 75;
  const key = dateKey();
  const row = await prisma.rpmDailyScore.upsert({
    where: { userId_dateKey: { userId, dateKey: key } },
    update: { score, breakdown: JSON.stringify(breakdown) },
    create: { userId, dateKey: key, score, breakdown: JSON.stringify(breakdown) },
  });

  await prisma.rpmEnrollment.updateMany({
    where: { userId },
    data: { lastScore: score, lastCheckedAt: new Date() },
  });

  return row;
}

export async function runRpmCheck(userId: string, actorId?: string) {
  const enrollment = await ensureRpmEnrollment(userId);
  if (!enrollment.active) throw new Error("RPM not active");

  const thresholds = enrollment.thresholdsJson
    ? (JSON.parse(enrollment.thresholdsJson) as typeof DEFAULT_THRESHOLDS)
    : DEFAULT_THRESHOLDS;

  const checks: Array<{ type: string; mapTo: string }> = [
    { type: "heart_rate", mapTo: "heart_rate" },
    { type: "blood_pressure_systolic", mapTo: "blood_pressure" },
    { type: "blood_pressure_diastolic", mapTo: "blood_pressure" },
    { type: "blood_sugar", mapTo: "blood_sugar" },
    { type: "temperature", mapTo: "temperature" },
    { type: "ecg_hr", mapTo: "ecg" },
    { type: "weight", mapTo: "weight" },
    { type: "sleep", mapTo: "sleep" },
    { type: "medication_adherence", mapTo: "medication_adherence" },
  ];

  const alerts = [];
  for (const c of checks) {
    const thr = thresholds[c.type as keyof typeof DEFAULT_THRESHOLDS];
    if (!thr) continue;
    const m = await latestMetric(userId, c.type);
    if (!m) continue;
    const abnormal = m.value < thr.low || m.value > thr.high;
    if (!abnormal) continue;
    const emergency = m.value < thr.low * 0.85 || m.value > thr.high * 1.15;
    const severity = emergency ? "critical" : "warning";
    const message = `Abnormal ${c.type.replace(/_/g, " ")}: ${m.value}${m.unit ? " " + m.unit : ""} (range ${thr.low}–${thr.high})`;
    const alert = await prisma.rpmAlert.create({
      data: {
        patientId: userId,
        doctorId: enrollment.doctorId,
        metricType: c.mapTo,
        value: m.value,
        threshold: `${thr.low}-${thr.high}`,
        severity,
        message,
        emergency,
      },
    });
    alerts.push(alert);

    await notifyUser({
      userId,
      subject: emergency ? "RPM emergency alert" : "RPM abnormal reading",
      body: message,
      kind: emergency ? "emergency" : "reminder",
      emergency,
      channels: emergency ? ["email", "sms", "push", "emergency"] : ["email", "push", "inbox"],
    }).catch(() => undefined);

    if (enrollment.doctorId) {
      await notifyUser({
        userId: enrollment.doctorId,
        subject: `Patient RPM alert (${severity})`,
        body: message,
        kind: emergency ? "emergency" : "general",
        emergency,
        channels: ["email", "push", "inbox"],
      }).catch(() => undefined);
    }
  }

  const score = await computeDailyHealthScore(userId);
  if (actorId) await audit(actorId, "rpm.check", "RpmEnrollment", enrollment.id);

  return { enrollment, alerts, score };
}

export async function listRpmDashboard(userId: string, isClinician: boolean) {
  const enrollment = await prisma.rpmEnrollment.findUnique({ where: { userId } });
  const score = await prisma.rpmDailyScore.findFirst({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });
  const alerts = await prisma.rpmAlert.findMany({
    where: isClinician ? { OR: [{ patientId: userId }, { doctorId: userId }] } : { patientId: userId },
    orderBy: { createdAt: "desc" },
    take: 40,
  });

  const monitorTypes = [
    "heart_rate",
    "blood_pressure_systolic",
    "blood_sugar",
    "temperature",
    "ecg_hr",
    "weight",
    "sleep",
    "medication_adherence",
  ];
  const latest: Record<string, { value: number; unit: string | null; recordedAt: Date }> = {};
  for (const type of monitorTypes) {
    const m = await latestMetric(userId, type);
    if (m) latest[type] = { value: m.value, unit: m.unit, recordedAt: m.recordedAt };
  }

  return { enrollment, score, alerts, latest, monitors: RPM_MONITORS };
}
