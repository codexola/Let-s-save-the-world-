import { NextRequest, NextResponse } from "next/server";
import { PrescriptionStatus } from "@prisma/client";
import { getSession } from "@/lib/auth";
import { sendEmail } from "@/lib/mail";
import { prisma } from "@/lib/db";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (session.role === "PHARMACY") {
    const profile = await prisma.pharmacyProfile.findUnique({
      where: { userId: session.id },
    });
    const prescriptions = await prisma.prescription.findMany({
      where: profile ? { pharmacyId: profile.id } : undefined,
      include: {
        patient: { select: { id: true, name: true, email: true } },
        doctor: { select: { id: true, name: true } },
      },
      orderBy: { issuedAt: "desc" },
      take: 100,
    });
    return NextResponse.json({ prescriptions, role: "pharmacy" });
  }

  if (session.role === "DOCTOR") {
    const prescriptions = await prisma.prescription.findMany({
      where: { doctorId: session.id },
      include: {
        patient: { select: { id: true, name: true, email: true } },
      },
      orderBy: { issuedAt: "desc" },
    });
    return NextResponse.json({ prescriptions, role: "doctor" });
  }

  const prescriptions = await prisma.prescription.findMany({
    where: { patientId: session.id },
    include: {
      doctor: { select: { id: true, name: true } },
    },
    orderBy: { issuedAt: "desc" },
  });
  return NextResponse.json({ prescriptions, role: "patient" });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();

  if (body.action === "issue") {
    if (session.role !== "DOCTOR" && session.role !== "ADMIN" && session.role !== "DEVELOPER") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const prescription = await prisma.prescription.create({
      data: {
        patientId: String(body.patientId),
        doctorId: session.id,
        medication: String(body.medication),
        dosage: body.dosage ? String(body.dosage) : null,
        status: "ISSUED",
        expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
      },
      include: { patient: { select: { email: true, id: true, name: true } } },
    });

    await sendEmail({
      to: prescription.patient.email,
      userId: prescription.patient.id,
      subject: "New prescription issued",
      body: `Dr. ${session.name} issued a prescription for ${prescription.medication}.`,
    });

    return NextResponse.json({ prescription });
  }

  if (body.action === "update_status") {
    if (session.role !== "PHARMACY" && session.role !== "ADMIN" && session.role !== "DEVELOPER") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const status = body.status as PrescriptionStatus;
    const prescription = await prisma.prescription.update({
      where: { id: body.id },
      data: { status },
      include: { patient: { select: { email: true, id: true, name: true } } },
    });

    await sendEmail({
      to: prescription.patient.email,
      userId: prescription.patient.id,
      subject: "Prescription status updated",
      body: `Your prescription for ${prescription.medication} is now: ${status}.`,
    });

    return NextResponse.json({ prescription });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
