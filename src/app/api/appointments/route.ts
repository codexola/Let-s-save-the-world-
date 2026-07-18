import { NextRequest, NextResponse } from "next/server";
import { AppointmentType } from "@prisma/client";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const appointments = await prisma.appointment.findMany({
    where:
      session.role === "DOCTOR"
        ? { doctorId: session.id }
        : session.role === "ADMIN" || session.role === "DEVELOPER"
          ? undefined
          : { patientId: session.id },
    include: {
      patient: { select: { name: true, email: true } },
      doctor: { select: { name: true, email: true } },
    },
    orderBy: { scheduledAt: "desc" },
  });
  return NextResponse.json({ appointments });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();

  if (body.action === "book") {
    const appointment = await prisma.appointment.create({
      data: {
        patientId: session.id,
        doctorId: body.doctorId,
        type: (body.type as AppointmentType) || "VIDEO",
        scheduledAt: new Date(body.scheduledAt),
        notes: body.notes,
        status: "BOOKED",
      },
    });
    await prisma.notification.create({
      data: {
        userId: session.id,
        email: session.email,
        subject: "Appointment booked",
        body: `Your ${body.type || "VIDEO"} appointment is scheduled for ${body.scheduledAt}`,
        channel: "email",
      },
    });
    return NextResponse.json({ appointment });
  }

  if (body.action === "cancel") {
    const appointment = await prisma.appointment.update({
      where: { id: body.id },
      data: { status: "CANCELLED" },
    });
    return NextResponse.json({ appointment });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
