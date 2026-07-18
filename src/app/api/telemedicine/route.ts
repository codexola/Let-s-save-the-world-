import { NextRequest, NextResponse } from "next/server";
import { getSession, audit } from "@/lib/auth";
import { sendEmail } from "@/lib/mail";
import { createVideoRoom, transcribeSessionNotes } from "@/lib/video";
import { prisma } from "@/lib/db";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sessions = await prisma.telemedicineSession.findMany({
    where: {
      OR: [{ hostId: session.id }, { patientId: session.id }],
    },
    include: {
      host: { select: { id: true, name: true } },
      patient: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  const doctors = await prisma.doctorProfile.findMany({
    where: { verified: true, onlineAvailable: true },
    include: { user: { select: { id: true, name: true } } },
    take: 50,
  });

  return NextResponse.json({ sessions, doctors });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();

  if (body.action === "create") {
    if (!body.recordingConsent) {
      return NextResponse.json({ error: "Recording consent required" }, { status: 400 });
    }

    const patientId =
      session.role === "PATIENT" ? session.id : String(body.patientId || session.id);
    const hostId =
      session.role === "DOCTOR" ? session.id : String(body.hostId || body.doctorId || "");

    if (!hostId || hostId === patientId) {
      return NextResponse.json({ error: "Valid host (doctor) required" }, { status: 400 });
    }

    let appointmentId = body.appointmentId ? String(body.appointmentId) : null;
    if (!appointmentId && session.role === "PATIENT") {
      const upcoming = await prisma.appointment.findFirst({
        where: {
          patientId: session.id,
          doctorId: hostId,
          type: "VIDEO",
          status: { in: ["BOOKED", "RESCHEDULED"] },
          scheduledAt: { gte: new Date(Date.now() - 60 * 60 * 1000) },
        },
        orderBy: { scheduledAt: "asc" },
      });
      appointmentId = upcoming?.id || null;
    }

    const draft = await prisma.telemedicineSession.create({
      data: {
        appointmentId,
        hostId,
        patientId,
        roomUrl: "pending",
        recordingConsent: true,
        recordingEnabled: Boolean(body.enableRecording),
        screenShareEnabled: body.screenShareEnabled !== false,
        quality: String(body.quality || "hd"),
        status: "scheduled",
      },
    });

    const room = await createVideoRoom(draft.id, {
      recording: Boolean(body.enableRecording),
      quality: String(body.quality || "hd"),
    });
    const sessionRecord = await prisma.telemedicineSession.update({
      where: { id: draft.id },
      data: {
        roomUrl: room.roomUrl,
        provider: room.provider,
        recordingEnabled: room.recordingEnabled,
        screenShareEnabled: room.screenShareEnabled,
        quality: room.quality,
        recordingUrl: room.recordingEnabled
          ? `${room.roomUrl}#recording=cloud`
          : null,
      },
    });

    const patient = await prisma.user.findUnique({ where: { id: patientId } });
    if (patient) {
      await sendEmail({
        to: patient.email,
        userId: patient.id,
        subject: "Telemedicine session scheduled",
        body: `Your HD video visit is ready (screen share ${room.screenShareEnabled ? "on" : "off"}, recording ${room.recordingEnabled ? "enabled" : "off"}). Join: ${room.roomUrl}`,
      });
    }

    await audit(session.id, "telemedicine.create", "TelemedicineSession", draft.id);
    return NextResponse.json({ session: sessionRecord });
  }

  if (body.action === "join") {
    const existing = await prisma.telemedicineSession.findUnique({
      where: { id: body.sessionId },
    });
    if (!existing) return NextResponse.json({ error: "Session not found" }, { status: 404 });
    if (existing.hostId !== session.id && existing.patientId !== session.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const updated = await prisma.telemedicineSession.update({
      where: { id: existing.id },
      data: { status: "active" },
    });
    return NextResponse.json({ session: updated });
  }

  if (body.action === "save_notes") {
    const existing = await prisma.telemedicineSession.findUnique({
      where: { id: body.sessionId },
    });
    if (!existing) return NextResponse.json({ error: "Session not found" }, { status: 404 });
    if (existing.hostId !== session.id && session.role !== "ADMIN") {
      return NextResponse.json({ error: "Only the host doctor can save notes" }, { status: 403 });
    }
    const updated = await prisma.telemedicineSession.update({
      where: { id: existing.id },
      data: { notes: String(body.notes || "") },
    });
    return NextResponse.json({ session: updated });
  }

  if (body.action === "transcribe") {
    const existing = await prisma.telemedicineSession.findUnique({
      where: { id: body.sessionId },
    });
    if (!existing) return NextResponse.json({ error: "Session not found" }, { status: 404 });
    if (existing.hostId !== session.id && existing.patientId !== session.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const source = String(body.notes || existing.notes || "");
    if (!source.trim()) {
      return NextResponse.json({ error: "Notes required for transcription" }, { status: 400 });
    }
    const transcription = await transcribeSessionNotes(source);
    const updated = await prisma.telemedicineSession.update({
      where: { id: existing.id },
      data: { transcription, notes: existing.notes || source },
    });
    return NextResponse.json({ session: updated, transcription });
  }

  if (body.action === "issue_prescription") {
    if (session.role !== "DOCTOR" && session.role !== "ADMIN") {
      return NextResponse.json({ error: "Only doctors can issue prescriptions" }, { status: 403 });
    }
    const existing = await prisma.telemedicineSession.findUnique({
      where: { id: body.sessionId },
    });
    if (!existing) return NextResponse.json({ error: "Session not found" }, { status: 404 });
    if (existing.hostId !== session.id && session.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    let pharmacyId: string | null = body.pharmacyId ? String(body.pharmacyId) : null;
    if (!pharmacyId) {
      const pharmacy = await prisma.pharmacyProfile.findFirst({ orderBy: { name: "asc" } });
      pharmacyId = pharmacy?.id || null;
    }

    const prescription = await prisma.prescription.create({
      data: {
        patientId: existing.patientId,
        doctorId: session.id,
        pharmacyId,
        medication: String(body.medication),
        dosage: body.dosage ? String(body.dosage) : null,
        status: "ISSUED",
        expiresAt: body.expiresAt
          ? new Date(body.expiresAt)
          : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
      include: { patient: { select: { email: true, id: true, name: true } } },
    });

    await prisma.telemedicineSession.update({
      where: { id: existing.id },
      data: {
        notes: `${existing.notes || ""}\n[Rx issued] ${prescription.medication} ${prescription.dosage || ""}`.trim(),
      },
    });

    await sendEmail({
      to: prescription.patient.email,
      userId: prescription.patient.id,
      subject: "Prescription from video consultation",
      body: `Dr. ${session.name} issued ${prescription.medication} during your telemedicine visit.`,
    });

    return NextResponse.json({ prescription });
  }

  if (body.action === "end") {
    const existing = await prisma.telemedicineSession.findUnique({
      where: { id: body.sessionId },
    });
    if (!existing) return NextResponse.json({ error: "Session not found" }, { status: 404 });
    if (existing.hostId !== session.id && existing.patientId !== session.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const updated = await prisma.telemedicineSession.update({
      where: { id: existing.id },
      data: { status: "completed" },
    });
    if (existing.appointmentId) {
      await prisma.appointment.updateMany({
        where: { id: existing.appointmentId },
        data: { status: "COMPLETED" },
      });
    }
    return NextResponse.json({ session: updated });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
