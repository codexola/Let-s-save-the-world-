import { NextRequest, NextResponse } from "next/server";
import { AppointmentStatus, AppointmentType } from "@prisma/client";
import { getSession, audit } from "@/lib/auth";
import { sendEmail } from "@/lib/mail";
import { createVideoRoom } from "@/lib/video";
import { prisma } from "@/lib/db";

function addRecurrence(base: Date, rule: string, index: number): Date {
  const d = new Date(base);
  const r = rule.toUpperCase();
  if (r === "DAILY") d.setDate(d.getDate() + index);
  else if (r === "WEEKLY") d.setDate(d.getDate() + index * 7);
  else if (r === "BIWEEKLY") d.setDate(d.getDate() + index * 14);
  else if (r === "MONTHLY") d.setMonth(d.getMonth() + index);
  else d.setDate(d.getDate() + index * 7);
  return d;
}

async function estimateQueue(doctorId: string | null | undefined, scheduledAt: Date) {
  if (!doctorId) return { queuePosition: 1, estimatedWaitMinutes: 10 };
  const dayStart = new Date(scheduledAt);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(scheduledAt);
  dayEnd.setHours(23, 59, 59, 999);
  const sameDay = await prisma.appointment.findMany({
    where: {
      doctorId,
      scheduledAt: { gte: dayStart, lte: dayEnd },
      status: { in: ["BOOKED", "RESCHEDULED", "WAITING_LIST"] },
    },
    orderBy: { scheduledAt: "asc" },
  });
  const ahead = sameDay.filter((a) => a.scheduledAt.getTime() <= scheduledAt.getTime()).length;
  const queuePosition = Math.max(1, ahead);
  const estimatedWaitMinutes = queuePosition * 12;
  return { queuePosition, estimatedWaitMinutes };
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sp = req.nextUrl.searchParams;

  if (sp.get("doctors") === "1") {
    const forType = sp.get("type") || "";
    const doctors = await prisma.doctorProfile.findMany({
      where: {
        verified: true,
        ...(forType === "VIDEO" || forType === "online"
          ? { onlineAvailable: true }
          : forType === "HOME_VISIT"
            ? {}
            : forType === "IN_PERSON"
              ? { offlineAvailable: true }
              : {}),
      },
      include: {
        user: { select: { id: true, name: true, photoUrl: true, email: true } },
      },
      take: 50,
    });
    return NextResponse.json({ doctors });
  }

  if (sp.get("nurses") === "1") {
    const nurses = await prisma.nurseProfile.findMany({
      where: { homeVisitAvailable: true },
      include: { user: { select: { id: true, name: true, photoUrl: true } } },
      take: 50,
    });
    return NextResponse.json({ nurses });
  }

  if (sp.get("queue") === "1") {
    const doctorId = sp.get("doctorId") || session.id;
    const now = new Date();
    const waiting = await prisma.appointment.findMany({
      where: {
        doctorId,
        status: { in: ["WAITING_LIST", "BOOKED"] },
        scheduledAt: { gte: new Date(now.getTime() - 2 * 60 * 60 * 1000) },
      },
      include: {
        patient: { select: { id: true, name: true } },
      },
      orderBy: [{ queuePosition: "asc" }, { scheduledAt: "asc" }],
      take: 40,
    });
    const withEta = waiting.map((a, i) => ({
      ...a,
      queuePosition: a.queuePosition ?? i + 1,
      estimatedWaitMinutes: a.estimatedWaitMinutes ?? (i + 1) * 12,
    }));
    return NextResponse.json({ queue: withEta });
  }

  const appointments = await prisma.appointment.findMany({
    where:
      session.role === "DOCTOR"
        ? { doctorId: session.id }
        : session.role === "HOSPITAL"
          ? { hospitalId: session.id }
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
    const type = (body.type as AppointmentType) || "VIDEO";
    const scheduledAt = new Date(body.scheduledAt);
    const doctorId = body.doctorId ? String(body.doctorId) : null;
    const joinWaitlist = Boolean(body.waitlist);
    const recurrenceRule = body.recurrenceRule ? String(body.recurrenceRule).toUpperCase() : null;
    const recurrenceCount = Math.min(Number(body.recurrenceCount || 1), 12);

    let hospitalId: string | null = body.hospitalId ? String(body.hospitalId) : null;
    if (!hospitalId && doctorId) {
      const doc = await prisma.doctorProfile.findUnique({ where: { userId: doctorId } });
      if (doc?.hospitalAffiliation) {
        const hospital = await prisma.hospitalProfile.findFirst({
          where: { name: { contains: doc.hospitalAffiliation.split(",")[0].trim() } },
        });
        hospitalId = hospital?.userId || null;
      }
    }

    const queue = await estimateQueue(doctorId, scheduledAt);
    const status: AppointmentStatus = joinWaitlist ? "WAITING_LIST" : "BOOKED";

    const parent = await prisma.appointment.create({
      data: {
        patientId: session.id,
        doctorId,
        hospitalId,
        type,
        scheduledAt,
        notes: body.notes || null,
        status,
        recurrenceRule: recurrenceRule && recurrenceRule !== "NONE" ? recurrenceRule : null,
        queuePosition: queue.queuePosition,
        estimatedWaitMinutes: queue.estimatedWaitMinutes,
      },
      include: { doctor: { select: { name: true, id: true } } },
    });

    const createdIds = [parent.id];
    if (recurrenceRule && recurrenceRule !== "NONE" && recurrenceCount > 1) {
      for (let i = 1; i < recurrenceCount; i++) {
        const nextAt = addRecurrence(scheduledAt, recurrenceRule, i);
        const q = await estimateQueue(doctorId, nextAt);
        const child = await prisma.appointment.create({
          data: {
            patientId: session.id,
            doctorId,
            hospitalId,
            type,
            scheduledAt: nextAt,
            notes: body.notes || `Recurring (${recurrenceRule}) #${i + 1}`,
            status: "BOOKED",
            recurrenceRule,
            recurrenceParentId: parent.id,
            queuePosition: q.queuePosition,
            estimatedWaitMinutes: q.estimatedWaitMinutes,
          },
        });
        createdIds.push(child.id);
      }
    }

    let telemedicine = null;
    if (type === "VIDEO" && doctorId && !joinWaitlist) {
      const draft = await prisma.telemedicineSession.create({
        data: {
          appointmentId: parent.id,
          hostId: doctorId,
          patientId: session.id,
          roomUrl: "pending",
          recordingConsent: Boolean(body.recordingConsent ?? true),
          screenShareEnabled: true,
          quality: "hd",
          status: "scheduled",
        },
      });
      const room = await createVideoRoom(draft.id);
      telemedicine = await prisma.telemedicineSession.update({
        where: { id: draft.id },
        data: { roomUrl: room.roomUrl, provider: room.provider },
      });
    }

    await sendEmail({
      to: session.email,
      userId: session.id,
      subject: joinWaitlist ? "Added to waiting list" : "Appointment booked",
      body: `Your ${type} appointment with ${parent.doctor?.name || "provider"} is ${joinWaitlist ? "on the waiting list" : "scheduled"} for ${scheduledAt.toISOString()}. Queue #${queue.queuePosition}, ETA ~${queue.estimatedWaitMinutes} min.${telemedicine ? ` Video room: ${telemedicine.roomUrl}` : ""}`,
    });

    await audit(session.id, "appointments.book", "Appointment", parent.id);
    return NextResponse.json({
      appointment: parent,
      series: createdIds,
      seriesCount: createdIds.length,
      queue,
      telemedicine,
    });
  }

  if (body.action === "cancel") {
    const existing = await prisma.appointment.findUnique({ where: { id: body.id } });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (existing.patientId !== session.id && session.role !== "ADMIN" && session.role !== "DEVELOPER") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (existing.status === "CANCELLED") {
      return NextResponse.json({ error: "Already cancelled" }, { status: 400 });
    }

    const appointment = await prisma.appointment.update({
      where: { id: body.id },
      data: { status: "CANCELLED" },
    });

    // Promote next waitlisted patient for same doctor/day
    if (existing.doctorId) {
      const next = await prisma.appointment.findFirst({
        where: {
          doctorId: existing.doctorId,
          status: "WAITING_LIST",
          scheduledAt: {
            gte: new Date(existing.scheduledAt.getTime() - 12 * 60 * 60 * 1000),
            lte: new Date(existing.scheduledAt.getTime() + 12 * 60 * 60 * 1000),
          },
        },
        orderBy: [{ queuePosition: "asc" }, { createdAt: "asc" }],
      });
      if (next) {
        await prisma.appointment.update({
          where: { id: next.id },
          data: {
            status: "BOOKED",
            scheduledAt: existing.scheduledAt,
            estimatedWaitMinutes: 0,
            queuePosition: 1,
          },
        });
      }
    }

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
    if (existing.status === "CANCELLED") {
      return NextResponse.json({ error: "Cannot reschedule cancelled appointment" }, { status: 400 });
    }

    const scheduledAt = new Date(body.scheduledAt);
    const queue = await estimateQueue(existing.doctorId, scheduledAt);
    const appointment = await prisma.appointment.update({
      where: { id: body.id },
      data: {
        scheduledAt,
        status: "RESCHEDULED",
        queuePosition: queue.queuePosition,
        estimatedWaitMinutes: queue.estimatedWaitMinutes,
      },
    });

    await sendEmail({
      to: session.email,
      userId: session.id,
      subject: "Appointment rescheduled",
      body: `Your appointment has been moved to ${body.scheduledAt}. Queue #${queue.queuePosition}, ETA ~${queue.estimatedWaitMinutes} min.`,
    });

    return NextResponse.json({ appointment, queue });
  }

  if (body.action === "join_waitlist") {
    const existing = await prisma.appointment.findUnique({ where: { id: body.id } });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (existing.patientId !== session.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const queue = await estimateQueue(existing.doctorId, existing.scheduledAt);
    const appointment = await prisma.appointment.update({
      where: { id: body.id },
      data: {
        status: "WAITING_LIST",
        queuePosition: queue.queuePosition,
        estimatedWaitMinutes: queue.estimatedWaitMinutes,
      },
    });
    return NextResponse.json({ appointment, queue });
  }

  if (body.action === "complete") {
    if (session.role !== "DOCTOR" && session.role !== "ADMIN" && session.role !== "DEVELOPER") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const appointment = await prisma.appointment.update({
      where: { id: body.id },
      data: { status: "COMPLETED" },
    });
    return NextResponse.json({ appointment });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
