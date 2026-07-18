import { prisma } from "./db";
import { audit } from "./auth";

export const WEARABLE_PLATFORMS = [
  { id: "apple_health", name: "Apple Health" },
  { id: "google_health_connect", name: "Google Health Connect" },
  { id: "fitbit", name: "Fitbit" },
  { id: "garmin", name: "Garmin" },
  { id: "samsung_health", name: "Samsung Health" },
  { id: "oura", name: "Oura Ring" },
  { id: "whoop", name: "WHOOP" },
  { id: "polar", name: "Polar" },
  { id: "withings", name: "Withings" },
] as const;

export const WEARABLE_METRIC_TYPES = [
  { type: "heart_rate", unit: "bpm", min: 55, max: 110 },
  { type: "blood_pressure_systolic", unit: "mmHg", min: 110, max: 145 },
  { type: "blood_pressure_diastolic", unit: "mmHg", min: 70, max: 95 },
  { type: "blood_oxygen", unit: "%", min: 95, max: 99 },
  { type: "temperature", unit: "°C", min: 36.2, max: 37.4 },
  { type: "ecg_hr", unit: "bpm", min: 58, max: 100 },
  { type: "weight", unit: "kg", min: 55, max: 95 },
  { type: "bmi", unit: "kg/m²", min: 18.5, max: 29 },
  { type: "body_fat", unit: "%", min: 12, max: 32 },
  { type: "sleep", unit: "h", min: 5.5, max: 8.5 },
  { type: "stress", unit: "score", min: 20, max: 70 },
  { type: "exercise_minutes", unit: "min", min: 10, max: 90 },
  { type: "calories", unit: "kcal", min: 1400, max: 2800 },
  { type: "blood_sugar", unit: "mg/dL", min: 85, max: 140 },
  { type: "step_count", unit: "steps", min: 2000, max: 12000 },
  { type: "hydration", unit: "ml", min: 800, max: 2800 },
  { type: "respiration", unit: "/min", min: 12, max: 20 },
  { type: "falls", unit: "count", min: 0, max: 0 },
] as const;

function rand(min: number, max: number) {
  return Math.round((min + Math.random() * (max - min)) * 10) / 10;
}

export async function connectWearable(opts: {
  userId: string;
  platform: string;
  displayName?: string;
}) {
  const meta = WEARABLE_PLATFORMS.find((p) => p.id === opts.platform);
  if (!meta) throw new Error("Unsupported wearable platform");
  const conn = await prisma.wearableConnection.upsert({
    where: { userId_platform: { userId: opts.userId, platform: opts.platform } },
    update: {
      status: "connected",
      syncEnabled: true,
      displayName: opts.displayName || meta.name,
      lastSyncAt: new Date(),
    },
    create: {
      userId: opts.userId,
      platform: opts.platform,
      status: "connected",
      displayName: opts.displayName || meta.name,
      externalId: `${opts.platform}_${opts.userId.slice(0, 8)}`,
      lastSyncAt: new Date(),
      metaJson: JSON.stringify({ oauth: "simulated", scopes: ["vitals", "activity", "sleep"] }),
    },
  });
  await audit(opts.userId, "wearable.connect", "WearableConnection", conn.id);
  return conn;
}

export async function disconnectWearable(userId: string, platform: string) {
  return prisma.wearableConnection.update({
    where: { userId_platform: { userId, platform } },
    data: { status: "disconnected", syncEnabled: false },
  });
}

/** Real-time sync simulation: ingest a full vital/activity sample set from a connected platform. */
export async function syncWearable(userId: string, platform?: string) {
  const where = {
    userId,
    status: "connected",
    syncEnabled: true,
    ...(platform ? { platform } : {}),
  };
  const connections = await prisma.wearableConnection.findMany({ where });
  if (!connections.length) throw new Error("No connected wearables to sync");

  const created: string[] = [];
  const now = new Date();

  for (const conn of connections) {
    for (const m of WEARABLE_METRIC_TYPES) {
      const value = m.type === "falls" ? 0 : rand(m.min, m.max);
      const row = await prisma.healthMetric.create({
        data: {
          userId,
          type: m.type,
          value,
          unit: m.unit,
          source: conn.platform,
          deviceId: conn.externalId || conn.id,
          note: `Synced from ${conn.displayName || conn.platform}`,
          recordedAt: now,
        },
      });
      created.push(row.id);
    }
    await prisma.wearableConnection.update({
      where: { id: conn.id },
      data: { lastSyncAt: now },
    });
  }

  await audit(userId, "wearable.sync", "WearableConnection", connections[0].id);
  return { syncedAt: now.toISOString(), metricsCreated: created.length, platforms: connections.map((c) => c.platform) };
}

export async function latestWearableMetrics(userId: string) {
  const types = WEARABLE_METRIC_TYPES.map((m) => m.type);
  const latest: Record<string, { value: number; unit: string | null; source: string | null; recordedAt: Date }> = {};
  for (const type of types) {
    const row = await prisma.healthMetric.findFirst({
      where: { userId, type, source: { not: "manual" } },
      orderBy: { recordedAt: "desc" },
    });
    if (row) {
      latest[type] = {
        value: row.value,
        unit: row.unit,
        source: row.source,
        recordedAt: row.recordedAt,
      };
    }
  }
  return latest;
}
