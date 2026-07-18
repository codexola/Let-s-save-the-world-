import { Role } from "@prisma/client";
import { prisma } from "./db";

export const REVIEW_TARGET_TYPES = [
  "doctor",
  "hospital",
  "pharmacy",
  "nurse",
  "patient",
  "company",
  "medicine",
  "user",
] as const;

/** Allowed author→target combinations per product rules. */
export function allowedReviewPair(authorRole: Role, targetType: string): boolean {
  const t = targetType.toLowerCase();
  switch (authorRole) {
    case Role.PATIENT:
      return ["doctor", "hospital", "pharmacy", "nurse", "medicine", "user"].includes(t);
    case Role.COMPANY:
      return ["hospital", "user"].includes(t);
    case Role.HOSPITAL:
      return ["company", "user"].includes(t);
    case Role.DOCTOR:
      return ["patient", "user"].includes(t);
    case Role.NURSE:
      return ["patient", "hospital", "user"].includes(t);
    case Role.PHARMACY:
      return ["patient", "doctor", "user"].includes(t);
    case Role.ADMIN:
    case Role.DEVELOPER:
      return true;
    default:
      return false;
  }
}

export async function resolveTargetUserId(targetType: string, targetId: string): Promise<string | null> {
  const t = targetType.toLowerCase();
  if (["user", "patient", "company"].includes(t)) return targetId;

  if (t === "doctor") {
    const p = await prisma.doctorProfile.findFirst({
      where: { OR: [{ id: targetId }, { userId: targetId }] },
    });
    return p?.userId || null;
  }
  if (t === "nurse") {
    const p = await prisma.nurseProfile.findFirst({
      where: { OR: [{ id: targetId }, { userId: targetId }] },
    });
    return p?.userId || null;
  }
  if (t === "hospital") {
    const p = await prisma.hospitalProfile.findFirst({
      where: { OR: [{ id: targetId }, { userId: targetId }] },
    });
    return p?.userId || null;
  }
  if (t === "pharmacy") {
    const p = await prisma.pharmacyProfile.findFirst({
      where: { OR: [{ id: targetId }, { userId: targetId }] },
    });
    return p?.userId || null;
  }
  return null;
}

const APPT_OK = ["COMPLETED", "BOOKED", "RESCHEDULED"] as const;

/** Verified appointments / orders only. */
export async function hasVerifiedRelationship(
  authorId: string,
  authorRole: Role,
  targetType: string,
  targetId: string,
  targetUserId: string | null
): Promise<boolean> {
  const t = targetType.toLowerCase();

  if (t === "medicine") {
    const order = await prisma.marketplaceOrder.findFirst({
      where: { userId: authorId, medicineId: targetId },
    });
    return Boolean(order);
  }

  if (authorRole === Role.ADMIN || authorRole === Role.DEVELOPER) return true;

  if (authorRole === Role.PATIENT) {
    if (t === "doctor" || (t === "user" && targetUserId)) {
      const doctorId = targetUserId || targetId;
      const appt = await prisma.appointment.findFirst({
        where: {
          patientId: authorId,
          doctorId,
          status: { in: [...APPT_OK] },
        },
      });
      return Boolean(appt);
    }
    if (t === "hospital") {
      const hospitalUserId = targetUserId || targetId;
      const appt = await prisma.appointment.findFirst({
        where: {
          patientId: authorId,
          hospitalId: hospitalUserId,
          status: { in: [...APPT_OK] },
        },
      });
      return Boolean(appt);
    }
    if (t === "nurse" && targetUserId) {
      const chat = await prisma.chatThread.findFirst({
        where: {
          OR: [
            { participantAId: authorId, participantBId: targetUserId },
            { participantBId: authorId, participantAId: targetUserId },
          ],
        },
      });
      return Boolean(chat);
    }
    if (t === "pharmacy" && targetUserId) {
      const ph = await prisma.pharmacyProfile.findFirst({
        where: { OR: [{ id: targetId }, { userId: targetUserId }] },
      });
      if (!ph) return false;
      const rx = await prisma.prescription.findFirst({
        where: { patientId: authorId, pharmacyId: ph.id },
      });
      return Boolean(rx);
    }
  }

  if (authorRole === Role.DOCTOR && (t === "patient" || t === "user") && targetUserId) {
    const appt = await prisma.appointment.findFirst({
      where: {
        doctorId: authorId,
        patientId: targetUserId,
        status: { in: [...APPT_OK] },
      },
    });
    return Boolean(appt);
  }

  if (authorRole === Role.COMPANY && t === "hospital") return true;
  if (authorRole === Role.HOSPITAL && t === "company") return true;

  return false;
}

const SPAM_PATTERNS = [
  /\b(buy now|click here|crypto|viagra|casino)\b/i,
  /(.)\1{6,}/,
  /https?:\/\/\S+/i,
];

export async function scoreReviewFraud(opts: {
  authorId: string;
  comment: string | null;
  rating: number;
  targetId: string;
}): Promise<{ fraudScore: number; spamFlag: boolean }> {
  let fraudScore = 0;
  const text = (opts.comment || "").trim();

  if (!text) fraudScore += 15;
  if (text.length > 0 && text.length < 8) fraudScore += 20;
  for (const p of SPAM_PATTERNS) {
    if (p.test(text)) fraudScore += 35;
  }
  if (opts.rating === 1 || opts.rating === 5) fraudScore += 5;

  const recent = await prisma.review.count({
    where: {
      authorId: opts.authorId,
      createdAt: { gte: new Date(Date.now() - 1000 * 60 * 60) },
    },
  });
  if (recent >= 5) fraudScore += 40;
  else if (recent >= 3) fraudScore += 20;

  const duplicate = await prisma.review.findFirst({
    where: {
      authorId: opts.authorId,
      targetId: opts.targetId,
      createdAt: { gte: new Date(Date.now() - 1000 * 60 * 60 * 24 * 7) },
    },
  });
  if (duplicate) fraudScore += 50;

  const sameComment = text
    ? await prisma.review.count({
        where: {
          authorId: opts.authorId,
          comment: text,
          createdAt: { gte: new Date(Date.now() - 1000 * 60 * 60 * 24 * 30) },
        },
      })
    : 0;
  if (sameComment >= 2) fraudScore += 30;

  return { fraudScore, spamFlag: fraudScore >= 60 };
}
