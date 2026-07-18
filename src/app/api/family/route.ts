import { NextRequest, NextResponse } from "next/server";
import { requireSession, audit } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  FAMILY_RELATIONSHIPS,
  familyDashboard,
  addFamilyMember,
  bookFamilyAppointment,
  manageFamilyMedication,
} from "@/lib/family";

export async function GET() {
  try {
    const session = await requireSession();
    const dash = await familyDashboard(session.id);
    return NextResponse.json(dash);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error";
    const status = message === "UNAUTHORIZED" ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    const body = await req.json();
    const action = body.action as string;

    if (action === "add_member") {
      const member = await addFamilyMember({
        ownerId: session.id,
        name: String(body.name),
        relationship: String(body.relationship),
        dateOfBirth: body.dateOfBirth ? String(body.dateOfBirth) : undefined,
        emergencyContact: body.emergencyContact ? String(body.emergencyContact) : undefined,
        phone: body.phone ? String(body.phone) : undefined,
        allergies: body.allergies ? String(body.allergies) : undefined,
        medications: body.medications ? String(body.medications) : undefined,
        medicalNotes: body.medicalNotes ? String(body.medicalNotes) : undefined,
        vaccinationNotes: body.vaccinationNotes ? String(body.vaccinationNotes) : undefined,
      });
      return NextResponse.json({ member, relationships: FAMILY_RELATIONSHIPS });
    }

    if (action === "update_member") {
      const existing = await prisma.familyMember.findFirst({
        where: { id: String(body.id), ownerId: session.id },
      });
      if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
      const member = await prisma.familyMember.update({
        where: { id: existing.id },
        data: {
          emergencyContact: body.emergencyContact != null ? String(body.emergencyContact) : undefined,
          medications: body.medications != null ? String(body.medications) : undefined,
          medicalNotes: body.medicalNotes != null ? String(body.medicalNotes) : undefined,
          vaccinationNotes: body.vaccinationNotes != null ? String(body.vaccinationNotes) : undefined,
          allergies: body.allergies != null ? String(body.allergies) : undefined,
          phone: body.phone != null ? String(body.phone) : undefined,
        },
      });
      await audit(session.id, "family.update", "FamilyMember", member.id);
      return NextResponse.json({ member });
    }

    if (action === "book_appointment") {
      const appointment = await bookFamilyAppointment({
        ownerId: session.id,
        familyMemberId: String(body.familyMemberId),
        title: String(body.title),
        scheduledAt: String(body.scheduledAt),
        location: body.location ? String(body.location) : undefined,
        notes: body.notes ? String(body.notes) : undefined,
      });
      return NextResponse.json({ appointment });
    }

    if (action === "add_medication") {
      const medication = await manageFamilyMedication({
        ownerId: session.id,
        familyMemberId: String(body.familyMemberId),
        medication: String(body.medication),
        dosage: body.dosage ? String(body.dosage) : undefined,
        schedule: body.schedule ? String(body.schedule) : undefined,
      });
      return NextResponse.json({ medication });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error";
    const status = message === "UNAUTHORIZED" ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
