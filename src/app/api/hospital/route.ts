import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (session.role !== "HOSPITAL" && session.role !== "ADMIN" && session.role !== "DEVELOPER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const profile = await prisma.hospitalProfile.findFirst({
    where:
      session.role === "HOSPITAL"
        ? { userId: session.id }
        : undefined,
  });

  const hospitalUserId = profile?.userId;
  const appointments = await prisma.appointment.findMany({
    where: hospitalUserId ? { hospitalId: hospitalUserId } : undefined,
    include: {
      patient: { select: { name: true } },
      doctor: { select: { name: true } },
    },
    orderBy: { scheduledAt: "desc" },
    take: 20,
  });

  const bookedCount = appointments.filter((a) => a.status === "BOOKED").length;
  const occupancyPct =
    profile && profile.totalBeds > 0
      ? Math.min(100, Math.round((bookedCount / profile.totalBeds) * 100))
      : 0;

  return NextResponse.json({
    profile,
    beds: {
      total: profile?.totalBeds ?? 0,
      icu: profile?.icuBeds ?? 0,
      operatingRooms: profile?.operatingRooms ?? 0,
      occupiedEstimate: bookedCount,
      occupancyPct,
    },
    appointments,
  });
}
