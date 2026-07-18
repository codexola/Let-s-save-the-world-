import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

function parseFavorites(raw: string | null | undefined) {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const now = new Date();
  const user = await prisma.user.findUnique({
    where: { id: session.id },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      patientProfile: true,
      doctorProfile: true,
      nurseProfile: true,
      hospitalProfile: true,
      pharmacyProfile: { include: { medicines: true } },
      companyProfile: true,
    },
  });

  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (session.role === Role.PATIENT) {
    const [
      appointments,
      prescriptions,
      reviews,
      subscriptions,
      aiConsultations,
      chatThreads,
    ] = await Promise.all([
      prisma.appointment.findMany({
        where: { patientId: session.id },
        include: { doctor: { select: { name: true } } },
        orderBy: { scheduledAt: "desc" },
        take: 50,
      }),
      prisma.prescription.findMany({
        where: { patientId: session.id },
        include: { doctor: { select: { name: true } } },
        orderBy: { issuedAt: "desc" },
        take: 50,
      }),
      prisma.review.findMany({
        where: { authorId: session.id },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
      prisma.subscription.findMany({
        where: { userId: session.id },
        orderBy: { createdAt: "desc" },
      }),
      prisma.aiConsultation.findMany({
        where: { userId: session.id },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
      prisma.chatThread.findMany({
        where: {
          OR: [{ participantAId: session.id }, { participantBId: session.id }],
        },
        include: {
          participantA: { select: { id: true, name: true } },
          participantB: { select: { id: true, name: true } },
          messages: { orderBy: { createdAt: "desc" }, take: 1 },
        },
        orderBy: { updatedAt: "desc" },
      }),
    ]);

    const profile = user.patientProfile;
    return NextResponse.json({
      role: Role.PATIENT,
      profile: user.patientProfile,
      favorites: {
        hospitals: parseFavorites(profile?.favoriteHospitals),
        doctors: parseFavorites(profile?.favoriteDoctors),
      },
      appointments,
      prescriptions,
      chatThreads,
      chatThreadsCount: chatThreads.length,
      reviews,
      subscriptions,
      aiConsultations,
    });
  }

  if (session.role === Role.DOCTOR) {
    const [waitingPatients, prescriptions] = await Promise.all([
      prisma.appointment.findMany({
        where: {
          doctorId: session.id,
          scheduledAt: { gte: now },
          status: "BOOKED",
        },
        include: { patient: { select: { id: true, name: true, email: true } } },
        orderBy: { scheduledAt: "asc" },
      }),
      prisma.prescription.findMany({
        where: { doctorId: session.id },
        include: { patient: { select: { name: true } } },
        orderBy: { issuedAt: "desc" },
        take: 50,
      }),
    ]);

    return NextResponse.json({
      role: Role.DOCTOR,
      profile: user.doctorProfile,
      waitingPatients,
      prescriptions,
    });
  }

  if (session.role === Role.NURSE) {
    const nurseProfile = user.nurseProfile;
    const appointments = nurseProfile?.hospitalAffiliation
      ? await prisma.appointment.findMany({
          where: {
            status: "BOOKED",
            scheduledAt: { gte: now },
            doctor: {
              doctorProfile: {
                hospitalAffiliation: nurseProfile.hospitalAffiliation,
              },
            },
          },
          include: {
            patient: { select: { id: true, name: true } },
            doctor: { select: { name: true } },
          },
          orderBy: { scheduledAt: "asc" },
        })
      : [];

    return NextResponse.json({
      role: Role.NURSE,
      profile: nurseProfile,
      appointments,
    });
  }

  if (session.role === Role.HOSPITAL) {
    const profile = user.hospitalProfile;
    const [appointments, linkedDoctors, linkedNurses] = await Promise.all([
      prisma.appointment.findMany({
        where: { hospitalId: session.id },
        include: {
          patient: { select: { name: true } },
          doctor: { select: { name: true } },
        },
        orderBy: { scheduledAt: "desc" },
        take: 20,
      }),
      profile?.name
        ? prisma.user.count({
            where: {
              role: Role.DOCTOR,
              doctorProfile: { hospitalAffiliation: { contains: profile.name.split(" ")[0] } },
            },
          })
        : Promise.resolve(0),
      profile?.name
        ? prisma.user.count({
            where: {
              role: Role.NURSE,
              nurseProfile: { hospitalAffiliation: { contains: profile.name.split(" ")[0] } },
            },
          })
        : Promise.resolve(0),
    ]);

    const bookedCount = appointments.filter((a) => a.status === "BOOKED").length;
    const occupancyPct =
      profile && profile.totalBeds > 0
        ? Math.min(100, Math.round((bookedCount / profile.totalBeds) * 100))
        : 0;

    return NextResponse.json({
      role: Role.HOSPITAL,
      profile,
      counts: {
        appointments: appointments.length,
        linkedDoctors,
        linkedNurses,
        icuBeds: profile?.icuBeds ?? 0,
        totalBeds: profile?.totalBeds ?? 0,
        operatingRooms: profile?.operatingRooms ?? 0,
        occupancyPct,
      },
      appointments,
    });
  }

  if (session.role === Role.PHARMACY) {
    const profile = user.pharmacyProfile;
    const prescriptions = profile
      ? await prisma.prescription.findMany({
          where: { pharmacyId: profile.id },
          include: {
            patient: { select: { name: true } },
            doctor: { select: { name: true } },
          },
          orderBy: { issuedAt: "desc" },
          take: 50,
        })
      : [];

    return NextResponse.json({
      role: Role.PHARMACY,
      profile,
      medicines: profile?.medicines ?? [],
      prescriptions,
    });
  }

  if (session.role === Role.COMPANY) {
    return NextResponse.json({
      role: Role.COMPANY,
      profile: user.companyProfile,
    });
  }

  return NextResponse.json({ role: session.role, profile: null });
}
