import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { runCdsSupport, CDS_DISCLAIMER } from "@/lib/cds";

export async function GET() {
  try {
    const session = await requireSession();
    const sessions = await prisma.cdsSession.findMany({
      where: { clinicianId: session.id },
      orderBy: { createdAt: "desc" },
      take: 20,
    });
    return NextResponse.json({ sessions, disclaimer: CDS_DISCLAIMER });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error";
    const status = message === "UNAUTHORIZED" ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    if (!["DOCTOR", "NURSE", "ADMIN", "DEVELOPER", "HOSPITAL"].includes(session.role)) {
      return NextResponse.json(
        { error: "CDS is for clinicians", disclaimer: CDS_DISCLAIMER },
        { status: 403 }
      );
    }
    const body = await req.json();
    const action = body.action || "analyze";

    if (action === "analyze") {
      let patientId = body.patientId ? String(body.patientId) : undefined;
      if (!patientId && body.patientEmail) {
        const p = await prisma.user.findUnique({
          where: { email: String(body.patientEmail).toLowerCase() },
        });
        patientId = p?.id;
      }
      if (!patientId) {
        const p = await prisma.user.findFirst({ where: { email: "patient@medcare.local" } });
        patientId = p?.id;
      }
      const result = await runCdsSupport({
        clinicianId: session.id,
        patientId,
        chiefComplaint: String(body.chiefComplaint || body.symptoms || ""),
        medications: Array.isArray(body.medications) ? body.medications.map(String) : undefined,
        labText: body.labText ? String(body.labText) : undefined,
        imagingNotes: body.imagingNotes ? String(body.imagingNotes) : undefined,
        docNotes: body.docNotes ? String(body.docNotes) : undefined,
      });
      return NextResponse.json(result);
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error";
    const status = message === "UNAUTHORIZED" ? 401 : 400;
    return NextResponse.json({ error: message, disclaimer: CDS_DISCLAIMER }, { status });
  }
}
