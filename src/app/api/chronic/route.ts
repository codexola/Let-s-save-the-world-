import { NextRequest, NextResponse } from "next/server";
import { requireSession, audit } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  CHRONIC_CONDITIONS,
  enrollChronic,
  logChronicProgress,
  runChronicAiMonitoring,
  scheduleDoctorFollowUp,
  sendDueMedicationReminders,
} from "@/lib/chronic";

export async function GET() {
  try {
    const session = await requireSession();
    const conditions = await prisma.chronicCondition.findMany({
      where: { userId: session.id },
      include: {
        reminders: { where: { active: true } },
        progressLogs: { orderBy: { recordedAt: "desc" }, take: 10 },
      },
      orderBy: { updatedAt: "desc" },
    });
    return NextResponse.json({
      supported: CHRONIC_CONDITIONS,
      conditions,
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
      const condition = await enrollChronic({
        userId: session.id,
        condition: String(body.condition),
        doctorId,
      });
      return NextResponse.json({ condition });
    }

    if (action === "progress") {
      const log = await logChronicProgress({
        userId: session.id,
        conditionId: String(body.conditionId),
        metric: String(body.metric || "score"),
        value: Number(body.value),
        unit: body.unit ? String(body.unit) : undefined,
        note: body.note ? String(body.note) : undefined,
      });
      return NextResponse.json({ log });
    }

    if (action === "follow_up") {
      const condition = await scheduleDoctorFollowUp(String(body.conditionId), Number(body.days) || 14);
      await audit(session.id, "chronic.follow_up", "ChronicCondition", condition.id);
      return NextResponse.json({ condition });
    }

    if (action === "reminders") {
      const sent = await sendDueMedicationReminders(session.id);
      return NextResponse.json({ sent });
    }

    if (action === "ai_monitor") {
      const result = await runChronicAiMonitoring(session.id);
      return NextResponse.json(result);
    }

    if (action === "add_reminder") {
      const reminder = await prisma.chronicMedReminder.create({
        data: {
          userId: session.id,
          conditionId: body.conditionId ? String(body.conditionId) : null,
          medication: String(body.medication),
          dosage: body.dosage ? String(body.dosage) : null,
          schedule: String(body.schedule || "daily"),
          nextDueAt: new Date(Date.now() + 3600_000),
          active: true,
        },
      });
      return NextResponse.json({ reminder });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error";
    const status = message === "UNAUTHORIZED" ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
