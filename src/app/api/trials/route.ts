import { NextRequest, NextResponse } from "next/server";
import { requireSession, audit } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  ensureTrialsSeed,
  publishTrial,
  applyToTrial,
  updateParticipation,
  aiMatchScore,
} from "@/lib/trials";

export async function GET(req: NextRequest) {
  try {
    const session = await requireSession();
    await ensureTrialsSeed();
    const sp = req.nextUrl.searchParams;
    const id = sp.get("id");

    if (id) {
      const trial = await prisma.clinicalTrial.findUnique({
        where: { id },
        include: {
          researcher: { select: { id: true, name: true, email: true } },
          participations: {
            include: { patient: { select: { id: true, name: true } } },
          },
        },
      });
      if (!trial) return NextResponse.json({ error: "Not found" }, { status: 404 });
      const ehr = await prisma.electronicHealthRecord.findUnique({ where: { userId: session.id } });
      const chronic = await prisma.chronicCondition.findMany({ where: { userId: session.id } });
      const match = aiMatchScore(trial, {
        diagnoses: ehr?.diagnoses,
        conditions: chronic.map((c) => c.condition),
      });
      return NextResponse.json({ trial, match });
    }

    const trials = await prisma.clinicalTrial.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        researcher: { select: { id: true, name: true } },
        _count: { select: { participations: true } },
      },
    });
    const myParticipations = await prisma.trialParticipation.findMany({
      where: { patientId: session.id },
      include: { trial: true },
      orderBy: { createdAt: "desc" },
    });

    // AI matching ranking for patient
    const ehr = await prisma.electronicHealthRecord.findUnique({ where: { userId: session.id } });
    const chronic = await prisma.chronicCondition.findMany({ where: { userId: session.id } });
    const ranked = trials
      .map((t) => ({
        trial: t,
        match: aiMatchScore(t, {
          diagnoses: ehr?.diagnoses,
          conditions: chronic.map((c) => c.condition),
        }),
      }))
      .sort((a, b) => b.match.score - a.match.score);

    return NextResponse.json({ trials, myParticipations, ranked });
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

    if (action === "publish") {
      if (!["RESEARCHER", "DOCTOR", "ADMIN", "DEVELOPER"].includes(session.role)) {
        return NextResponse.json({ error: "Only researchers can publish" }, { status: 403 });
      }
      const trial = await publishTrial({
        researcherId: session.id,
        title: String(body.title),
        eligibility: body.eligibility ? String(body.eligibility) : undefined,
        compensation: body.compensation ? String(body.compensation) : undefined,
        location: body.location ? String(body.location) : undefined,
        consentForm: body.consentForm ? String(body.consentForm) : undefined,
        description: body.description ? String(body.description) : undefined,
        scheduleNotes: body.scheduleNotes ? String(body.scheduleNotes) : undefined,
        monitoringPlan: body.monitoringPlan ? String(body.monitoringPlan) : undefined,
        tags: body.tags ? String(body.tags) : undefined,
      });
      return NextResponse.json({ trial });
    }

    if (action === "apply" || action === "recruit") {
      const result = await applyToTrial({
        trialId: String(body.trialId),
        patientId: session.id,
        signConsent: Boolean(body.signConsent),
      });
      return NextResponse.json(result);
    }

    if (action === "consent") {
      const result = await applyToTrial({
        trialId: String(body.trialId),
        patientId: session.id,
        signConsent: true,
      });
      return NextResponse.json(result);
    }

    if (action === "monitor" || action === "results" || action === "schedule") {
      const participation = await updateParticipation({
        id: String(body.id),
        status: body.status ? String(body.status) : undefined,
        monitoringNotes: body.monitoringNotes ? String(body.monitoringNotes) : undefined,
        resultNotes: body.resultNotes ? String(body.resultNotes) : undefined,
        scheduledAt: body.scheduledAt ? String(body.scheduledAt) : undefined,
      });
      await audit(session.id, `trial.${action}`, "TrialParticipation", participation.id);
      return NextResponse.json({ participation });
    }

    if (action === "publish_results") {
      if (!["RESEARCHER", "DOCTOR", "ADMIN", "DEVELOPER"].includes(session.role)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      const trial = await prisma.clinicalTrial.update({
        where: { id: String(body.trialId) },
        data: {
          resultsSummary: String(body.resultsSummary || ""),
          status: body.status ? String(body.status) : "completed",
        },
      });
      return NextResponse.json({ trial });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error";
    const status = message === "UNAUTHORIZED" ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
