import { NextRequest, NextResponse } from "next/server";
import { AppointmentType } from "@prisma/client";
import { getSession } from "@/lib/auth";
import { sendEmail } from "@/lib/mail";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (req.nextUrl.searchParams.get("doctors") === "1") {
    const doctors = await prisma.doctorProfile.findMany({
      where: { verified: true, onlineAvailable: true },
      include: {
        user: { select: { id: true, name: true, photoUrl: true, email: true } },
      },
      take: 50,
    });
    return NextResponse.json({ doctors });
  }

  const appointments = await prisma.appointment.findMany({
    where:
      session.role === "DOCTOR"
        ? { doctorId: session.id }
        : session.role === "ADMIN" || session.role === "DEVELOPER"
          ? undefined
          : { patientId: session.id },
    include: {
      patient: { select: { id: true, name: true, email: true } },
      doctor: { select: { id: true, name: true, email: true } },
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
      include: {
        doctor: { select: { name: true } },
      },
    });

    await sendEmail({
      to: session.email,
      userId: session.id,
      subject: "Appointment booked",
      body: `Your ${body.type || "VIDEO"} appointment with ${appointment.doctor?.name || "provider"} is scheduled for ${body.scheduledAt}.`,
    });

    return NextResponse.json({ appointment });
  }

  if (body.action === "cancel") {
    const existing = await prisma.appointment.findUnique({ where: { id: body.id } });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (existing.patientId !== session.id && session.role !== "ADMIN" && session.role !== "DEVELOPER") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const appointment = await prisma.appointment.update({
      where: { id: body.id },
      data: { status: "CANCELLED" },
    });

    await sendEmail({
      to: session.email,
      userId: session.id,
      subject: "Appointment cancelled",
      body: `Your appointment on ${existing.scheduledAt.toISOString()} has been cancelled.`,
    });

    return NextResponse.json({ appointment });
  }

  if (body.action === "reschedule") {
    const existing = await prisma.appointment.findUnique({ where: { id: body.id } });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (existing.patientId !== session.id && session.role !== "ADMIN" && session.role !== "DEVELOPER") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const appointment = await prisma.appointment.update({
      where: { id: body.id },
      data: {
        scheduledAt: new Date(body.scheduledAt),
        status: "RESCHEDULED",
      },
    });

    await sendEmail({
      to: session.email,
      userId: session.id,
      subject: "Appointment rescheduled",
      body: `Your appointment has been moved to ${body.scheduledAt}.`,
    });

    return NextResponse.json({ appointment });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
