import { prisma } from "./db";
import { audit } from "./auth";
import { decryptMessage } from "./chat-crypto";

export const PRIVACY_POLICY_VERSION = process.env.PRIVACY_POLICY_VERSION || "2026.1";

export const CONSENT_TYPES = [
  {
    type: "terms",
    purpose: "Use of MedCare platform services",
    legalBasis: "contract",
    required: true,
  },
  {
    type: "privacy",
    purpose: "Processing of personal information under APPI / GDPR / HIPAA-aligned notices",
    legalBasis: "consent",
    required: true,
  },
  {
    type: "health_data",
    purpose: "Processing of sensitive health data for care delivery",
    legalBasis: "consent",
    required: true,
  },
  {
    type: "telemedicine",
    purpose: "Video consultations, notes, and optional recording",
    legalBasis: "consent",
    required: false,
  },
  {
    type: "data_share",
    purpose: "Sharing records with treating doctors, hospitals, and pharmacies",
    legalBasis: "consent",
    required: false,
  },
  {
    type: "marketing",
    purpose: "Optional product updates and health campaigns",
    legalBasis: "consent",
    required: false,
  },
  {
    type: "research",
    purpose: "De-identified research and quality improvement",
    legalBasis: "consent",
    required: false,
  },
] as const;

export async function hasActiveConsent(userId: string, type: string) {
  const row = await prisma.consent.findFirst({
    where: {
      userId,
      type,
      granted: true,
      withdrawnAt: null,
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
    orderBy: { createdAt: "desc" },
  });
  return Boolean(row);
}

export async function setConsent(opts: {
  userId: string;
  type: string;
  granted: boolean;
  purpose?: string;
  legalBasis?: string;
  ip?: string | null;
  locale?: string;
}) {
  const meta = CONSENT_TYPES.find((c) => c.type === opts.type);
  if (opts.granted) {
    await prisma.consent.updateMany({
      where: { userId: opts.userId, type: opts.type, withdrawnAt: null },
      data: { withdrawnAt: new Date(), granted: false },
    });
    const row = await prisma.consent.create({
      data: {
        userId: opts.userId,
        type: opts.type,
        purpose: opts.purpose || meta?.purpose || opts.type,
        legalBasis: opts.legalBasis || meta?.legalBasis || "consent",
        granted: true,
        version: PRIVACY_POLICY_VERSION,
        locale: opts.locale || "ja",
        ip: opts.ip || null,
      },
    });
    await audit(opts.userId, "privacy.consent_grant", "Consent", `${opts.type}:${row.id}`);
    return row;
  }

  await prisma.consent.updateMany({
    where: { userId: opts.userId, type: opts.type, withdrawnAt: null },
    data: { granted: false, withdrawnAt: new Date() },
  });
  await audit(opts.userId, "privacy.consent_withdraw", "Consent", opts.type);
  return null;
}

export async function listConsents(userId: string) {
  const rows = await prisma.consent.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });
  const latest = new Map<string, (typeof rows)[0]>();
  for (const r of rows) {
    if (!latest.has(r.type)) latest.set(r.type, r);
  }
  return {
    catalog: CONSENT_TYPES,
    current: Array.from(latest.values()),
    history: rows.slice(0, 50),
    policyVersion: PRIVACY_POLICY_VERSION,
  };
}

export async function exportPatientData(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      patientProfile: true,
      ehr: true,
      consents: true,
      appointments: { take: 200, orderBy: { scheduledAt: "desc" } },
      prescriptions: { take: 200, orderBy: { issuedAt: "desc" } },
      invoices: { take: 200, orderBy: { createdAt: "desc" } },
      aiConsultations: { take: 100, orderBy: { createdAt: "desc" } },
      healthMetrics: { take: 500, orderBy: { recordedAt: "desc" } },
      reviews: { take: 100 },
      subscriptions: true,
      notifications: { take: 100, orderBy: { createdAt: "desc" } },
      marketplaceOrders: { take: 100 },
      familyMembers: true,
      identityVerifications: true,
    },
  });
  if (!user) throw new Error("User not found");

  const threads = await prisma.chatThread.findMany({
    where: { OR: [{ participantAId: userId }, { participantBId: userId }] },
    include: { messages: { orderBy: { createdAt: "asc" }, take: 500 } },
  });

  const messages = threads.map((t) => ({
    threadId: t.id,
    messages: t.messages.map((m) => ({
      id: m.id,
      senderId: m.senderId,
      createdAt: m.createdAt,
      body: m.encrypted ? decryptMessage(m.body) : m.body,
    })),
  }));

  const package_ = {
    exportedAt: new Date().toISOString(),
    regulationNotice:
      "Personal data export for APPI (Japan), GDPR Art. 20 portability, and HIPAA-aligned patient access requests.",
    policyVersion: PRIVACY_POLICY_VERSION,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      phone: user.phone,
      locale: user.locale,
      gender: user.gender,
      dateOfBirth: user.dateOfBirth,
      createdAt: user.createdAt,
    },
    patientProfile: user.patientProfile,
    ehr: user.ehr,
    consents: user.consents,
    appointments: user.appointments,
    prescriptions: user.prescriptions,
    invoices: user.invoices,
    aiConsultations: user.aiConsultations,
    healthMetrics: user.healthMetrics,
    reviews: user.reviews,
    subscriptions: user.subscriptions,
    notifications: user.notifications,
    marketplaceOrders: user.marketplaceOrders,
    familyMembers: user.familyMembers,
    identityVerifications: user.identityVerifications.map((v) => ({
      ...v,
      documentData: v.documentData ? "[redacted in export metadata — request secure channel]" : null,
    })),
    chat: messages,
  };

  await audit(userId, "privacy.export", "User", userId);
  await prisma.dataSubjectRequest.create({
    data: {
      userId,
      type: "export",
      status: "completed",
      details: "Self-service data export",
      completedAt: new Date(),
    },
  });

  return package_;
}

/** Right to erasure / deletion where legally applicable — anonymize PHI, deactivate account */
export async function erasePatientData(userId: string, reason?: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error("User not found");

  const anonEmail = `deleted_${userId.slice(0, 8)}@anonymized.medcare.local`;
  const bcrypt = await import("bcryptjs");
  const { randomBytes } = await import("crypto");

  await prisma.$transaction(async (tx) => {
    await tx.electronicHealthRecord.deleteMany({ where: { userId } });
    await tx.healthMetric.deleteMany({ where: { userId } });
    await tx.familyMember.deleteMany({ where: { ownerId: userId } });
    await tx.identityVerification.deleteMany({ where: { userId } });
    await tx.aiConsultation.deleteMany({ where: { userId } });
    await tx.notification.deleteMany({ where: { userId } });
    await tx.blogBookmark.deleteMany({ where: { userId } });
    await tx.blogLike.deleteMany({ where: { userId } });
    await tx.webAuthnCredential.deleteMany({ where: { userId } });
    await tx.oAuthAccount.deleteMany({ where: { userId } });
    await tx.pushDevice.deleteMany({ where: { userId } });
    await tx.notificationPreference.deleteMany({ where: { userId } });

    const threads = await tx.chatThread.findMany({
      where: { OR: [{ participantAId: userId }, { participantBId: userId }] },
      select: { id: true },
    });
    for (const t of threads) {
      await tx.chatMessage.updateMany({
        where: { threadId: t.id, senderId: userId },
        data: { body: "[redacted — account erased]", encrypted: false },
      });
    }

    await tx.user.update({
      where: { id: userId },
      data: {
        email: anonEmail,
        name: "Deleted User",
        phone: null,
        photoUrl: null,
        bio: null,
        gender: null,
        dateOfBirth: null,
        passwordHash: await bcrypt.hash(randomBytes(32).toString("hex"), 10),
        active: false,
        verified: false,
        twoFactorEnabled: false,
        twoFactorSecret: null,
      },
    });

    await tx.patientProfile.updateMany({
      where: { userId },
      data: {
        allergies: null,
        medications: null,
        medicalHistory: null,
        insuranceInfo: null,
        emergencyContact: null,
        governmentId: null,
        governmentIdDocument: null,
        faceImageUrl: null,
      },
    });
  });

  await prisma.dataSubjectRequest.create({
    data: {
      userId,
      type: "erasure",
      status: "completed",
      details: reason || "Right to delete / erasure request",
      completedAt: new Date(),
      resolution: "PHI anonymized; account deactivated; billing aggregates retained per retention policy",
    },
  });

  await audit(userId, "privacy.erase", "User", reason || "erasure");
  return { ok: true, anonymizedEmail: anonEmail };
}

export async function ensureDefaultRetentionPolicies() {
  const defaults = [
    { resource: "notifications", retainDays: 365, action: "delete", description: "Inbox notifications" },
    { resource: "access_logs", retainDays: 730, action: "delete", description: "PHI access logs (APPI/HIPAA)" },
    { resource: "ai_consultations", retainDays: 2555, action: "anonymize", description: "~7 years clinical retention" },
    { resource: "audit_logs", retainDays: 2555, action: "keep", description: "Security audit retention" },
    { resource: "chat_messages", retainDays: 1095, action: "anonymize", description: "Messaging retention" },
    { resource: "health_metrics", retainDays: 2555, action: "anonymize", description: "Patient-generated health data" },
  ];
  for (const d of defaults) {
    await prisma.retentionPolicy.upsert({
      where: { resource: d.resource },
      update: { retainDays: d.retainDays, action: d.action, description: d.description, active: true },
      create: d,
    });
  }
}

export async function runRetentionJob() {
  await ensureDefaultRetentionPolicies();
  const policies = await prisma.retentionPolicy.findMany({ where: { active: true } });
  const now = Date.now();
  const results: Record<string, number> = {};

  for (const p of policies) {
    if (p.action === "keep") {
      results[p.resource] = 0;
      continue;
    }
    const cutoff = new Date(now - p.retainDays * 86400000);
    if (p.resource === "notifications") {
      const r = await prisma.notification.deleteMany({ where: { createdAt: { lt: cutoff } } });
      results.notifications = r.count;
    } else if (p.resource === "access_logs") {
      const r = await prisma.accessLog.deleteMany({ where: { createdAt: { lt: cutoff } } });
      results.access_logs = r.count;
    } else if (p.resource === "ai_consultations" && p.action === "anonymize") {
      const old = await prisma.aiConsultation.findMany({
        where: { createdAt: { lt: cutoff } },
        select: { id: true },
        take: 200,
      });
      for (const row of old) {
        await prisma.aiConsultation.update({
          where: { id: row.id },
          data: {
            symptoms: "[retained summary redacted]",
            analysis: "[anonymized per retention policy]",
            recommendations: null,
            resultJson: null,
          },
        });
      }
      results.ai_consultations = old.length;
    } else if (p.resource === "health_metrics" && p.action === "anonymize") {
      const r = await prisma.healthMetric.deleteMany({ where: { recordedAt: { lt: cutoff } } });
      results.health_metrics = r.count;
    }
  }

  await audit(null, "privacy.retention_run", "RetentionPolicy", JSON.stringify(results));
  return results;
}
