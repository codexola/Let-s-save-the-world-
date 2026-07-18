import { randomBytes } from "crypto";
import { prisma } from "./db";
import { notifyUser } from "./notify";
import { audit } from "./auth";

export const CAREGIVER_SERVICES = [
  "daily_care",
  "medical_assistance",
  "transportation",
  "meal_preparation",
  "companionship",
] as const;

export async function ensureCaregiverSeed() {
  let user = await prisma.user.findFirst({ where: { email: "caregiver@medcare.local" } });
  if (!user) {
    const bcrypt = await import("bcryptjs");
    const hash = await bcrypt.hash("Caregiver!2026", 10);
    user = await prisma.user.create({
      data: {
        email: "caregiver@medcare.local",
        name: "Mei Caregiver",
        role: "CAREGIVER",
        passwordHash: hash,
        active: true,
        verified: true,
        phone: "03-5555-0707",
        bio: "Certified home caregiver with elder-care focus.",
      },
    });
  }
  const profile = await prisma.caregiverProfile.upsert({
    where: { userId: user.id },
    update: {
      qualifications: "Certified Care Worker · First Aid · Dementia care training",
      availability: "Mon–Sat 08:00–20:00",
      experienceYears: 8,
      languages: "日本語, English",
      services: CAREGIVER_SERVICES.join(","),
      hourlyRateYen: 3500,
      bio: "Experienced caregiver specializing in daily care, medical assistance, and companionship.",
      verified: true,
      ratingAvg: 4.9,
      reviewCount: 12,
    },
    create: {
      userId: user.id,
      qualifications: "Certified Care Worker · First Aid · Dementia care training",
      availability: "Mon–Sat 08:00–20:00",
      experienceYears: 8,
      languages: "日本語, English",
      services: CAREGIVER_SERVICES.join(","),
      hourlyRateYen: 3500,
      bio: "Experienced caregiver specializing in daily care, medical assistance, and companionship.",
      verified: true,
      ratingAvg: 4.9,
      reviewCount: 12,
    },
  });

  const reviewCount = await prisma.caregiverReview.count({ where: { caregiverId: profile.id } });
  if (reviewCount === 0) {
    const patient = await prisma.user.findFirst({ where: { email: "patient@medcare.local" } });
    if (patient) {
      await prisma.caregiverReview.create({
        data: {
          caregiverId: profile.id,
          authorId: patient.id,
          rating: 5,
          body: "Punctual, kind, and excellent medical assistance support.",
        },
      });
    }
  }
  return { user, profile };
}

export async function listCaregivers() {
  await ensureCaregiverSeed();
  return prisma.caregiverProfile.findMany({
    include: {
      user: { select: { id: true, name: true, email: true, phone: true, photoUrl: true } },
      reviews: { orderBy: { createdAt: "desc" }, take: 10 },
    },
    orderBy: { ratingAvg: "desc" },
  });
}

export async function bookCaregiver(opts: {
  patientId: string;
  caregiverUserId: string;
  service: string;
  scheduledAt: string;
  hours?: number;
  notes?: string;
}) {
  if (!CAREGIVER_SERVICES.includes(opts.service as (typeof CAREGIVER_SERVICES)[number])) {
    throw new Error("Unsupported caregiver service");
  }
  const profile = await prisma.caregiverProfile.findUnique({ where: { userId: opts.caregiverUserId } });
  if (!profile) throw new Error("Caregiver not found");
  const hours = opts.hours || 2;
  const amountYen = Math.round(profile.hourlyRateYen * hours);
  const booking = await prisma.caregiverBooking.create({
    data: {
      patientId: opts.patientId,
      caregiverId: opts.caregiverUserId,
      service: opts.service,
      scheduledAt: new Date(opts.scheduledAt),
      hours,
      amountYen,
      status: "booked",
      paid: false,
      notes: opts.notes,
    },
  });
  await notifyUser({
    userId: opts.patientId,
    subject: "Caregiver scheduled",
    body: `${opts.service.replace(/_/g, " ")} booked for ${hours}h · ¥${amountYen.toLocaleString()}.`,
    kind: "appointment",
    channels: ["email", "push"],
  }).catch(() => undefined);
  await notifyUser({
    userId: opts.caregiverUserId,
    subject: "New caregiver booking",
    body: `New ${opts.service} booking on ${new Date(opts.scheduledAt).toLocaleString()}.`,
    kind: "appointment",
    channels: ["email", "push"],
  }).catch(() => undefined);
  await audit(opts.patientId, "caregiver.book", "CaregiverBooking", booking.id);
  return booking;
}

export async function payCaregiverBooking(bookingId: string, patientId: string) {
  const booking = await prisma.caregiverBooking.findFirst({
    where: { id: bookingId, patientId },
  });
  if (!booking) throw new Error("Booking not found");
  const paymentRef = `CGPAY-${randomBytes(4).toString("hex").toUpperCase()}`;
  return prisma.caregiverBooking.update({
    where: { id: bookingId },
    data: { paid: true, paymentRef, status: "confirmed" },
  });
}
