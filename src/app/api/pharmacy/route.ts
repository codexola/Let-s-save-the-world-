import { NextRequest, NextResponse } from "next/server";
import { PrescriptionStatus } from "@prisma/client";
import { getSession, audit } from "@/lib/auth";
import { sendEmail } from "@/lib/mail";
import { prisma } from "@/lib/db";
import { checkPatientMedicationInteractions } from "@/lib/ai-advanced";

const VALID_STATUS = new Set<string>([
  "ISSUED",
  "APPROVED",
  "PREPARING",
  "READY",
  "DELIVERED",
  "EXPIRED",
]);

async function expireOverdue() {
  const now = new Date();
  await prisma.prescription.updateMany({
    where: {
      expiresAt: { lt: now },
      status: { notIn: ["DELIVERED", "EXPIRED"] },
    },
    data: { status: "EXPIRED" },
  });
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await expireOverdue();

  if (req.nextUrl.searchParams.get("pharmacies") === "1") {
    const pharmacies = await prisma.pharmacyProfile.findMany({
      include: { user: { select: { id: true, name: true, email: true } } },
      take: 50,
    });
    return NextResponse.json({ pharmacies });
  }

  if (session.role === "PHARMACY") {
    const profile = await prisma.pharmacyProfile.findUnique({
      where: { userId: session.id },
    });
    if (!profile) {
      return NextResponse.json({ prescriptions: [], role: "pharmacy", error: "No pharmacy profile" });
    }
    const prescriptions = await prisma.prescription.findMany({
      where: { pharmacyId: profile.id },
      include: {
        patient: { select: { id: true, name: true, email: true } },
        doctor: { select: { id: true, name: true } },
      },
      orderBy: { issuedAt: "desc" },
      take: 100,
    });
    return NextResponse.json({ prescriptions, role: "pharmacy", pharmacyId: profile.id });
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

  if (session.role === "ADMIN" || session.role === "DEVELOPER") {
    const prescriptions = await prisma.prescription.findMany({
      include: {
        patient: { select: { id: true, name: true, email: true } },
        doctor: { select: { id: true, name: true } },
      },
      orderBy: { issuedAt: "desc" },
      take: 100,
    });
    return NextResponse.json({ prescriptions, role: "admin" });
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
  await expireOverdue();

  if (body.action === "issue") {
    if (session.role !== "DOCTOR" && session.role !== "ADMIN" && session.role !== "DEVELOPER") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    let pharmacyId: string | null = body.pharmacyId ? String(body.pharmacyId) : null;
    if (!pharmacyId) {
      const pharmacy = await prisma.pharmacyProfile.findFirst({ orderBy: { name: "asc" } });
      pharmacyId = pharmacy?.id || null;
    }
    if (!pharmacyId) {
      return NextResponse.json({ error: "No pharmacy available to fulfill prescription" }, { status: 400 });
    }

    const interactionCheck = await checkPatientMedicationInteractions(
      String(body.patientId),
      [String(body.medication)]
    );
    const critical = interactionCheck.alerts.filter((a) => a.severity === "critical");
    if (critical.length && !body.acknowledgeInteractions) {
      return NextResponse.json(
        {
          error: "Critical medication interaction / allergy alerts — set acknowledgeInteractions:true to proceed",
          alerts: interactionCheck.alerts,
        },
        { status: 409 }
      );
    }

    const expiresAt = body.expiresAt
      ? new Date(body.expiresAt)
      : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    const prescription = await prisma.prescription.create({
      data: {
        patientId: String(body.patientId),
        doctorId: session.id,
        pharmacyId,
        medication: String(body.medication),
        dosage: body.dosage ? String(body.dosage) : null,
        status: "ISSUED",
        expiresAt,
      },
      include: { patient: { select: { email: true, id: true, name: true } } },
    });

    await sendEmail({
      to: prescription.patient.email,
      userId: prescription.patient.id,
      subject: "New prescription issued",
      body: `Dr. ${session.name} issued a prescription for ${prescription.medication}. Status: ISSUED. Expires: ${expiresAt.toISOString().slice(0, 10)}.${
        interactionCheck.alerts.length
          ? `\n\nInteraction alerts:\n${interactionCheck.alerts.map((a) => `- [${a.severity}] ${a.message}`).join("\n")}`
          : ""
      }`,
    });

    await audit(session.id, "pharmacy.issue", "Prescription", prescription.id);
    return NextResponse.json({ prescription, interactionAlerts: interactionCheck.alerts });
  }

  if (body.action === "assign_pharmacy") {
    if (session.role !== "DOCTOR" && session.role !== "ADMIN" && session.role !== "PATIENT") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const existing = await prisma.prescription.findUnique({ where: { id: body.id } });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (
      existing.doctorId !== session.id &&
      existing.patientId !== session.id &&
      session.role !== "ADMIN"
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const prescription = await prisma.prescription.update({
      where: { id: body.id },
      data: { pharmacyId: String(body.pharmacyId) },
    });
    return NextResponse.json({ prescription });
  }

  if (body.action === "update_status") {
    if (session.role !== "PHARMACY" && session.role !== "ADMIN" && session.role !== "DEVELOPER") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const status = String(body.status);
    if (!VALID_STATUS.has(status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }

    const existing = await prisma.prescription.findUnique({ where: { id: body.id } });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    if (session.role === "PHARMACY") {
      const profile = await prisma.pharmacyProfile.findUnique({ where: { userId: session.id } });
      if (!profile || existing.pharmacyId !== profile.id) {
        return NextResponse.json({ error: "Prescription not assigned to your pharmacy" }, { status: 403 });
      }
    }

    const prescription = await prisma.prescription.update({
      where: { id: body.id },
      data: { status: status as PrescriptionStatus },
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
