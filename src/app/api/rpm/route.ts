import { NextRequest, NextResponse } from "next/server";
import { requireSession, audit } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  ensureRpmEnrollment,
  runRpmCheck,
  listRpmDashboard,
  computeDailyHealthScore,
  RPM_MONITORS,
} from "@/lib/rpm";

export async function GET(req: NextRequest) {
  try {
    const session = await requireSession();
    const sp = req.nextUrl.searchParams;
    const patientId =
      ["DOCTOR", "ADMIN", "DEVELOPER", "NURSE"].includes(session.role) && sp.get("patientId")
        ? String(sp.get("patientId"))
        : session.id;

    if (patientId !== session.id && !["DOCTOR", "ADMIN", "DEVELOPER", "NURSE", "HOSPITAL"].includes(session.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const isClinician = ["DOCTOR", "ADMIN", "DEVELOPER", "NURSE", "HOSPITAL"].includes(session.role);
    const dash = await listRpmDashboard(patientId, isClinician && patientId === session.id ? false : isClinician);

    // Clinician inbox: all alerts assigned to them
    let clinicianAlerts = null;
    if (isClinician) {
      clinicianAlerts = await prisma.rpmAlert.findMany({
        where: { doctorId: session.id },
        orderBy: { createdAt: "desc" },
        take: 50,
        include: { patient: { select: { id: true, name: true, email: true } } },
      });
    }

    return NextResponse.json({
      ...dash,
      monitors: RPM_MONITORS,
      clinicianAlerts,
    });
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

    if (action === "enroll") {
      let doctorId = body.doctorId ? String(body.doctorId) : undefined;
      if (!doctorId) {
        const doc = await prisma.user.findFirst({ where: { email: "doctor@medcare.local" } });
        doctorId = doc?.id;
      }
      const enrollment = await ensureRpmEnrollment(session.id, doctorId);
      await audit(session.id, "rpm.enroll", "RpmEnrollment", enrollment.id);
      return NextResponse.json({ enrollment });
    }

    if (action === "check" || action === "run_ai") {
      const patientId =
        ["DOCTOR", "ADMIN", "DEVELOPER"].includes(session.role) && body.patientId
          ? String(body.patientId)
          : session.id;
      const result = await runRpmCheck(patientId, session.id);
      return NextResponse.json(result);
    }

    if (action === "score") {
      const score = await computeDailyHealthScore(session.id);
      return NextResponse.json({ score });
    }

    if (action === "acknowledge") {
      const alert = await prisma.rpmAlert.update({
        where: { id: String(body.id) },
        data: { acknowledged: true },
      });
      return NextResponse.json({ alert });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error";
    const status = message === "UNAUTHORIZED" ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
