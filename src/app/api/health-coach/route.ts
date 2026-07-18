import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { dailyCoaching, updateGoalProgress, ensureCoachGoals, COACH_AREAS } from "@/lib/health-coach";

export async function GET() {
  try {
    const session = await requireSession();
    await ensureCoachGoals(session.id);
    const goals = await prisma.coachGoal.findMany({
      where: { userId: session.id },
      orderBy: { category: "asc" },
    });
    const checkIns = await prisma.coachCheckIn.findMany({
      where: { userId: session.id },
      orderBy: { createdAt: "desc" },
      take: 14,
    });
    return NextResponse.json({ goals, checkIns, areas: COACH_AREAS });
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

    if (action === "daily" || action === "coach") {
      const result = await dailyCoaching(session.id, body.focusArea ? String(body.focusArea) : undefined);
      return NextResponse.json(result);
    }

    if (action === "goal_progress") {
      await updateGoalProgress(String(body.goalId), session.id, Number(body.progress));
      const goals = await prisma.coachGoal.findMany({ where: { userId: session.id } });
      return NextResponse.json({ goals });
    }

    if (action === "add_goal") {
      const goal = await prisma.coachGoal.create({
        data: {
          userId: session.id,
          category: String(body.category || "nutrition"),
          title: String(body.title),
          targetValue: body.targetValue != null ? Number(body.targetValue) : null,
          unit: body.unit ? String(body.unit) : null,
          progress: 0,
        },
      });
      return NextResponse.json({ goal });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error";
    const status = message === "UNAUTHORIZED" ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
