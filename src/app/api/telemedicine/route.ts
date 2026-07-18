import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { sendEmail } from "@/lib/mail";
import { createVideoRoom } from "@/lib/video";
import { prisma } from "@/lib/db";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sessions = await prisma.telemedicineSession.findMany({
    where: {
      OR: [{ hostId: session.id }, { patientId: session.id }],
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return NextResponse.json({ sessions });
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

    const draft = await prisma.telemedicineSession.create({
      data: {
        appointmentId: body.appointmentId || null,
        hostId,
        patientId,
        roomUrl: "pending",
        recordingConsent: true,
        status: "scheduled",
      },
    });

    const room = await createVideoRoom(draft.id);
    const sessionRecord = await prisma.telemedicineSession.update({
      where: { id: draft.id },
      data: { roomUrl: room.roomUrl, provider: room.provider },
    });

    const patient = await prisma.user.findUnique({ where: { id: patientId } });
    if (patient) {
      await sendEmail({
        to: patient.email,
        userId: patient.id,
        subject: "Telemedicine session scheduled",
        body: `Your video visit is ready. Join: ${room.roomUrl}`,
      });
    }

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
    await prisma.telemedicineSession.update({
      where: { id: existing.id },
      data: { status: "active" },
    });
    return NextResponse.json({ session: existing });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
