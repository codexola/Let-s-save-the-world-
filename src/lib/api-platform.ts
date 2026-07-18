import { createHash, randomBytes, createHmac } from "crypto";
import { prisma } from "./db";
import { rateLimit } from "./rate-limit";

export const API_SCOPES = [
  "auth",
  "appointments",
  "medical_records",
  "laboratory",
  "imaging",
  "payments",
  "notifications",
  "prescriptions",
  "telemedicine",
  "wearables",
  "analytics",
] as const;

export type ApiScope = (typeof API_SCOPES)[number];

export function hashApiKey(raw: string) {
  return createHash("sha256").update(raw).digest("hex");
}

export function mintRawApiKey(sandbox: boolean) {
  const prefix = sandbox ? "mc_test_" : "mc_live_";
  return `${prefix}${randomBytes(24).toString("hex")}`;
}

export async function ensureDeveloperSeed(ownerId: string) {
  const existing = await prisma.developerApp.findFirst({ where: { ownerId } });
  if (existing) return existing;
  const app = await prisma.developerApp.create({
    data: {
      ownerId,
      name: "MedCare Sandbox App",
      description: "Demo integrator app with sandbox keys and webhooks",
      sandbox: true,
      status: "active",
    },
  });
  const raw = mintRawApiKey(true);
  await prisma.apiKey.create({
    data: {
      appId: app.id,
      name: "Default sandbox key",
      keyPrefix: raw.slice(0, 12),
      keyHash: hashApiKey(raw),
      scopesJson: JSON.stringify([...API_SCOPES]),
      rateLimit: 120,
      sandbox: true,
    },
  });
  await prisma.webhookEndpoint.create({
    data: {
      appId: app.id,
      url: "https://example.com/medcare/webhooks",
      secret: randomBytes(16).toString("hex"),
      eventsJson: JSON.stringify([
        "appointment.created",
        "payment.completed",
        "lab.result_ready",
        "prescription.ready",
      ]),
      active: true,
    },
  });
  // Store demo plaintext once in a delivery log note via usage (portal shows prefix only)
  await prisma.apiUsageLog.create({
    data: {
      appId: app.id,
      userId: ownerId,
      resource: "developers.seed",
      method: "SEED",
      statusCode: 201,
      sandbox: true,
    },
  });
  return { app, demoKey: raw };
}

export async function listDeveloperPortal(ownerId: string) {
  await ensureDeveloperSeed(ownerId);
  const apps = await prisma.developerApp.findMany({
    where: { ownerId },
    include: {
      apiKeys: { where: { revokedAt: null }, orderBy: { createdAt: "desc" } },
      webhooks: { include: { deliveries: { orderBy: { createdAt: "desc" }, take: 5 } } },
      usageLogs: { orderBy: { createdAt: "desc" }, take: 20 },
    },
    orderBy: { createdAt: "desc" },
  });
  return {
    apps,
    scopes: API_SCOPES,
    sdk: {
      typescript: "@medcare/sdk",
      python: "medcare-sdk",
      install: "npm i @medcare/sdk  |  pip install medcare-sdk",
      baseUrl: "/api/v1",
      authHeader: "Authorization: Bearer mc_test_…",
    },
    rateLimits: {
      defaultPerMinute: 120,
      sandboxPerMinute: 60,
      headers: ["X-RateLimit-Limit", "X-RateLimit-Remaining", "Retry-After"],
    },
  };
}

export async function createDeveloperApp(ownerId: string, name: string, description?: string, sandbox = true) {
  return prisma.developerApp.create({
    data: { ownerId, name, description, sandbox, status: "active" },
  });
}

export async function createApiKey(opts: {
  ownerId: string;
  appId: string;
  name: string;
  scopes?: string[];
  rateLimit?: number;
}) {
  const app = await prisma.developerApp.findFirst({
    where: { id: opts.appId, ownerId: opts.ownerId },
  });
  if (!app) throw new Error("App not found");
  const raw = mintRawApiKey(app.sandbox);
  const key = await prisma.apiKey.create({
    data: {
      appId: app.id,
      name: opts.name,
      keyPrefix: raw.slice(0, 12),
      keyHash: hashApiKey(raw),
      scopesJson: JSON.stringify(opts.scopes?.length ? opts.scopes : [...API_SCOPES]),
      rateLimit: opts.rateLimit ?? (app.sandbox ? 60 : 120),
      sandbox: app.sandbox,
    },
  });
  return { key, raw };
}

export async function revokeApiKey(ownerId: string, keyId: string) {
  const key = await prisma.apiKey.findFirst({
    where: { id: keyId, app: { ownerId } },
  });
  if (!key) throw new Error("Key not found");
  return prisma.apiKey.update({
    where: { id: keyId },
    data: { revokedAt: new Date() },
  });
}

export async function registerWebhook(opts: {
  ownerId: string;
  appId: string;
  url: string;
  events: string[];
}) {
  const app = await prisma.developerApp.findFirst({
    where: { id: opts.appId, ownerId: opts.ownerId },
  });
  if (!app) throw new Error("App not found");
  return prisma.webhookEndpoint.create({
    data: {
      appId: app.id,
      url: opts.url,
      secret: randomBytes(16).toString("hex"),
      eventsJson: JSON.stringify(opts.events),
      active: true,
    },
  });
}

export type PartnerContext = {
  appId: string;
  keyId: string;
  ownerId: string;
  sandbox: boolean;
  scopes: string[];
  rateLimit: number;
};

export async function authenticateApiKey(authHeader: string | null): Promise<PartnerContext> {
  if (!authHeader?.startsWith("Bearer ")) throw new Error("UNAUTHORIZED");
  const raw = authHeader.slice(7).trim();
  if (!raw.startsWith("mc_")) throw new Error("UNAUTHORIZED");
  const key = await prisma.apiKey.findUnique({
    where: { keyHash: hashApiKey(raw) },
    include: { app: true },
  });
  if (!key || key.revokedAt || key.app.status !== "active") throw new Error("UNAUTHORIZED");
  await prisma.apiKey.update({ where: { id: key.id }, data: { lastUsedAt: new Date() } });
  return {
    appId: key.appId,
    keyId: key.id,
    ownerId: key.app.ownerId,
    sandbox: key.sandbox,
    scopes: JSON.parse(key.scopesJson) as string[],
    rateLimit: key.rateLimit,
  };
}

export function assertScope(ctx: PartnerContext, scope: ApiScope) {
  if (!ctx.scopes.includes(scope) && !ctx.scopes.includes("*")) {
    throw new Error("FORBIDDEN_SCOPE");
  }
}

export function checkPartnerRateLimit(ctx: PartnerContext) {
  const limit = ctx.sandbox ? Math.min(ctx.rateLimit, 60) : ctx.rateLimit;
  return rateLimit({ key: `apikey:${ctx.keyId}`, limit, windowMs: 60_000 });
}

export async function logApiUsage(opts: {
  appId: string;
  userId?: string;
  resource: string;
  method: string;
  statusCode: number;
  sandbox: boolean;
}) {
  await prisma.apiUsageLog.create({ data: opts }).catch(() => undefined);
}

export function signWebhookPayload(secret: string, payload: string) {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

export async function dispatchWebhook(appId: string, event: string, data: Record<string, unknown>) {
  const endpoints = await prisma.webhookEndpoint.findMany({
    where: { appId, active: true },
  });
  const results = [];
  for (const ep of endpoints) {
    const events = JSON.parse(ep.eventsJson) as string[];
    if (!events.includes(event) && !events.includes("*")) continue;
    const payloadJson = JSON.stringify({
      id: randomBytes(8).toString("hex"),
      event,
      createdAt: new Date().toISOString(),
      data,
    });
    const signature = signWebhookPayload(ep.secret, payloadJson);
    let status = "delivered";
    let responseCode = 200;
    try {
      // Sandbox: record delivery without network call when URL is example.com
      if (ep.url.includes("example.com")) {
        status = "sandbox_simulated";
        responseCode = 200;
      } else {
        const res = await fetch(ep.url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-MedCare-Signature": signature,
            "X-MedCare-Event": event,
          },
          body: payloadJson,
          signal: AbortSignal.timeout(5000),
        });
        responseCode = res.status;
        status = res.ok ? "delivered" : "failed";
      }
    } catch {
      status = "failed";
      responseCode = 0;
    }
    const delivery = await prisma.webhookDelivery.create({
      data: {
        endpointId: ep.id,
        event,
        payloadJson,
        status,
        attempts: 1,
        responseCode,
        deliveredAt: status.includes("delivered") || status.includes("sandbox") ? new Date() : null,
      },
    });
    results.push(delivery);
  }
  return results;
}

export async function handleV1Resource(opts: {
  resource: string;
  method: string;
  ctx: PartnerContext;
  patientId?: string;
}) {
  const { resource, method, ctx } = opts;
  const sandboxNote = ctx.sandbox ? { environment: "sandbox" as const } : { environment: "live" as const };

  switch (resource) {
    case "auth":
      assertScope(ctx, "auth");
      return {
        ...sandboxNote,
        authentication: {
          methods: ["api_key", "session_oauth"],
          partner: { appId: ctx.appId, sandbox: ctx.sandbox },
        },
      };
    case "appointments":
      assertScope(ctx, "appointments");
      if (method === "GET") {
        const appointments = await prisma.appointment.findMany({
          take: ctx.sandbox ? 5 : 25,
          orderBy: { scheduledAt: "desc" },
          select: {
            id: true,
            status: true,
            type: true,
            scheduledAt: true,
            patientId: true,
            doctorId: true,
          },
        });
        return { ...sandboxNote, appointments };
      }
      break;
    case "medical_records":
    case "ehr":
      assertScope(ctx, "medical_records");
      {
        const patientId = opts.patientId;
        if (!patientId) throw new Error("patientId required");
        const consent = await prisma.consent.findFirst({
          where: {
            userId: patientId,
            granted: true,
            type: { in: ["data_sharing", "research", "care", "ehr_share", "api_share"] },
            withdrawnAt: null,
          },
        });
        if (!consent && !ctx.sandbox) throw new Error("CONSENT_REQUIRED");
        const ehr = await prisma.electronicHealthRecord.findUnique({ where: { userId: patientId } });
        return {
          ...sandboxNote,
          consent: consent ? { type: consent.type, granted: true } : { sandboxBypass: true },
          record: ehr
            ? { id: ehr.id, updatedAt: ehr.updatedAt, summary: "EHR available" }
            : ctx.sandbox
              ? { id: "sandbox-ehr", summary: "Sandbox EHR placeholder" }
              : null,
        };
      }
    case "laboratory":
      assertScope(ctx, "laboratory");
      return {
        ...sandboxNote,
        orders: await prisma.laboratoryOrder.findMany({
          take: 10,
          orderBy: { createdAt: "desc" },
          select: { id: true, status: true, testCode: true, patientId: true, createdAt: true },
        }),
      };
    case "imaging":
      assertScope(ctx, "imaging");
      return {
        ...sandboxNote,
        studies: await prisma.medicalImage.findMany({
          take: 10,
          orderBy: { createdAt: "desc" },
          select: { id: true, modality: true, title: true, patientId: true, createdAt: true },
        }),
      };
    case "payments":
    case "billing":
      assertScope(ctx, "payments");
      return {
        ...sandboxNote,
        invoices: await prisma.invoice.findMany({
          take: 10,
          orderBy: { createdAt: "desc" },
          select: { id: true, amountYen: true, status: true, description: true, createdAt: true },
        }),
      };
    case "notifications":
      assertScope(ctx, "notifications");
      return {
        ...sandboxNote,
        recent: await prisma.notification.findMany({
          take: 10,
          orderBy: { createdAt: "desc" },
          select: { id: true, subject: true, channel: true, createdAt: true },
        }),
      };
    case "prescriptions":
      assertScope(ctx, "prescriptions");
      return {
        ...sandboxNote,
        prescriptions: await prisma.prescription.findMany({
          take: 10,
          orderBy: { issuedAt: "desc" },
          select: { id: true, status: true, patientId: true, medication: true, issuedAt: true },
        }),
      };
    case "telemedicine":
      assertScope(ctx, "telemedicine");
      return {
        ...sandboxNote,
        sessions: await prisma.telemedicineSession.findMany({
          take: 10,
          orderBy: { createdAt: "desc" },
          select: { id: true, status: true, patientId: true, hostId: true, createdAt: true },
        }),
      };
    case "wearables":
      assertScope(ctx, "wearables");
      return {
        ...sandboxNote,
        connections: await prisma.wearableConnection.findMany({
          take: 10,
          orderBy: { createdAt: "desc" },
          select: { id: true, platform: true, status: true, userId: true },
        }),
      };
    case "analytics":
      assertScope(ctx, "analytics");
      return {
        ...sandboxNote,
        analytics: {
          users: await prisma.user.count(),
          appointments: await prisma.appointment.count(),
          prescriptions: await prisma.prescription.count(),
        },
      };
    default:
      throw new Error("Unknown resource");
  }
  throw new Error("Method not allowed");
}
