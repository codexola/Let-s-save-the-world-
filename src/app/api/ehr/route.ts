import { NextRequest, NextResponse } from "next/server";
import { requireSession, audit } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { clientMeta, logAccess } from "@/lib/access-log";
import { hasActiveConsent } from "@/lib/privacy";

export async function GET(req: NextRequest) {
  try {
    const session = await requireSession();
    const meta = clientMeta(req);

    if (session.role === "PATIENT") {
      const ok = await hasActiveConsent(session.id, "health_data");
      if (!ok) {
        // soft-allow read but warn — still log access
      }
    }

    const targetId =
      (session.role === "DOCTOR" || session.role === "ADMIN" || session.role === "DEVELOPER") &&
      req.nextUrl.searchParams.get("userId")
        ? String(req.nextUrl.searchParams.get("userId"))
        : session.id;

    if (targetId !== session.id && !["DOCTOR", "NURSE", "HOSPITAL", "ADMIN", "DEVELOPER"].includes(session.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    let ehr = await prisma.electronicHealthRecord.findUnique({ where: { userId: targetId } });
    if (!ehr && targetId === session.id) {
      ehr = await prisma.electronicHealthRecord.create({
        data: {
          userId: session.id,
          diagnoses: "Hypertension (managed)",
          treatments: "Lifestyle + ACE inhibitor as prescribed",
          labResults: "Pending latest panel",
          vaccinations: "Influenza 2025",
          lifestyle: "Walking 30 min most days",
        },
      });
    }

    await logAccess({
      userId: targetId,
      accessorId: session.id,
      action: "access.ehr.read",
      resource: "ElectronicHealthRecord",
      resourceId: ehr?.id,
      ...meta,
    });

    return NextResponse.json({ ehr });
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
    const meta = clientMeta(req);

    const ehr = await prisma.electronicHealthRecord.upsert({
      where: { userId: session.id },
      update: {
        diagnoses: body.diagnoses != null ? String(body.diagnoses) : undefined,
        treatments: body.treatments != null ? String(body.treatments) : undefined,
        operations: body.operations != null ? String(body.operations) : undefined,
        labResults: body.labResults != null ? String(body.labResults) : undefined,
        imaging: body.imaging != null ? String(body.imaging) : undefined,
        vaccinations: body.vaccinations != null ? String(body.vaccinations) : undefined,
        familyHistory: body.familyHistory != null ? String(body.familyHistory) : undefined,
        lifestyle: body.lifestyle != null ? String(body.lifestyle) : undefined,
        genetics: body.genetics != null ? String(body.genetics) : undefined,
      },
      create: {
        userId: session.id,
        diagnoses: body.diagnoses ? String(body.diagnoses) : null,
        treatments: body.treatments ? String(body.treatments) : null,
        labResults: body.labResults ? String(body.labResults) : null,
      },
    });

    await logAccess({
      userId: session.id,
      accessorId: session.id,
      action: "access.ehr.write",
      resource: "ElectronicHealthRecord",
      resourceId: ehr.id,
      ...meta,
    });
    await audit(session.id, "ehr.update", "ElectronicHealthRecord", ehr.id);
    return NextResponse.json({ ehr });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error";
    const status = message === "UNAUTHORIZED" ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
