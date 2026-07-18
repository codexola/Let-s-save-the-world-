import { NextRequest, NextResponse } from "next/server";
import { requireSession, audit } from "@/lib/auth";
import { clientMeta, logAccess } from "@/lib/access-log";
import { hasActiveConsent } from "@/lib/privacy";
import { EHR_SECTIONS, getLifelongEhr, upsertLifelongEhr } from "@/lib/ehr";
import { prisma } from "@/lib/db";
import { ensureDemoImaging } from "@/lib/imaging";

export async function GET(req: NextRequest) {
  try {
    const session = await requireSession();
    const meta = clientMeta(req);

    if (session.role === "PATIENT") {
      await hasActiveConsent(session.id, "health_data");
    }

    const targetId =
      (session.role === "DOCTOR" ||
        session.role === "ADMIN" ||
        session.role === "DEVELOPER" ||
        session.role === "NURSE") &&
      req.nextUrl.searchParams.get("userId")
        ? String(req.nextUrl.searchParams.get("userId"))
        : session.id;

    if (targetId !== session.id && !["DOCTOR", "NURSE", "HOSPITAL", "ADMIN", "DEVELOPER"].includes(session.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const doctor = await prisma.user.findFirst({ where: { role: "DOCTOR" } });
    await ensureDemoImaging(targetId, doctor?.id);

    let ehrRow = await prisma.electronicHealthRecord.findUnique({ where: { userId: targetId } });
    if (!ehrRow && targetId === session.id) {
      ehrRow = await prisma.electronicHealthRecord.create({
        data: {
          userId: session.id,
          diagnoses: "Hypertension (managed)",
          treatments: "Lifestyle + ACE inhibitor as prescribed",
          labResults: "See laboratory orders",
          vaccinations: "Influenza 2025; COVID booster 2025",
          lifestyle: "Walking 30 min most days",
          exercise: "Moderate aerobic 3–4×/week",
          smoking: "Never smoker",
          alcohol: "Occasional social",
          mentalHealth: "No active psychiatric diagnoses",
          dentalHistory: "Routine cleanings annual",
          pregnancyHistory: "N/A",
          genetics: "No known hereditary syndromes reported",
        },
      });
    }

    const lifelong = await getLifelongEhr(targetId);

    await logAccess({
      userId: targetId,
      accessorId: session.id,
      action: "access.ehr.read",
      resource: "ElectronicHealthRecord",
      resourceId: ehrRow?.id || lifelong?.id,
      ...meta,
    });

    return NextResponse.json({ ehr: lifelong, sections: EHR_SECTIONS, raw: ehrRow });
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

    const targetId =
      ["DOCTOR", "ADMIN", "DEVELOPER", "NURSE"].includes(session.role) && body.userId
        ? String(body.userId)
        : session.id;

    if (targetId !== session.id && !["DOCTOR", "ADMIN", "DEVELOPER", "NURSE"].includes(session.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const ehr = await upsertLifelongEhr(targetId, body);

    await logAccess({
      userId: targetId,
      accessorId: session.id,
      action: "access.ehr.write",
      resource: "ElectronicHealthRecord",
      resourceId: ehr.id,
      ...meta,
    });
    await audit(session.id, "ehr.update", "ElectronicHealthRecord", ehr.id);
    const lifelong = await getLifelongEhr(targetId);
    return NextResponse.json({ ehr: lifelong, raw: ehr });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error";
    const status = message === "UNAUTHORIZED" ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
