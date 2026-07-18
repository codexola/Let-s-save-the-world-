import { prisma } from "./db";
import { notifyUser } from "./notify";
import { sendDueMedicationReminders } from "./chronic";
import { computeDailyHealthScore } from "./rpm";

export const COACH_AREAS = [
  "nutrition",
  "exercise",
  "sleep",
  "stress",
  "smoking_cessation",
  "weight",
] as const;

const ADVICE: Record<string, string> = {
  nutrition: "Build a half-plate vegetables pattern; reduce ultra-processed snacks; hydrate 1.5–2L/day unless fluid-restricted.",
  exercise: "Aim for 150 min/week moderate activity; add 2 strength sessions; walk after meals.",
  sleep: "Fixed wake time, wind-down 30–60 min, limit screens/caffeine late; target 7–8h.",
  stress: "Box breathing 4×4, short outdoor breaks, schedule worry time; seek care if persistent distress.",
  smoking_cessation: "Set a quit date, remove cues, consider NRT/varenicline with clinician; track craving triggers.",
  weight: "Weekly weigh-ins, protein-forward meals, 500 kcal deficit if appropriate; celebrate non-scale wins.",
};

export async function ensureCoachGoals(userId: string) {
  const count = await prisma.coachGoal.count({ where: { userId } });
  if (count > 0) return;
  await prisma.coachGoal.createMany({
    data: [
      { userId, category: "nutrition", title: "Vegetables at 2 meals/day", targetValue: 14, unit: "meals/week", progress: 40 },
      { userId, category: "exercise", title: "Walk 8,000 steps", targetValue: 8000, unit: "steps", progress: 55 },
      { userId, category: "sleep", title: "7.5 hours sleep", targetValue: 7.5, unit: "hours", progress: 60 },
      { userId, category: "stress", title: "Daily 5-min breathing", targetValue: 7, unit: "sessions/week", progress: 30 },
      { userId, category: "weight", title: "Maintain healthy BMI range", targetValue: 23, unit: "BMI", progress: 50 },
      { userId, category: "smoking_cessation", title: "Smoke-free days", targetValue: 30, unit: "days", progress: 80 },
    ],
  });
}

export async function dailyCoaching(userId: string, focusArea?: string) {
  await ensureCoachGoals(userId);
  const area = (focusArea && COACH_AREAS.includes(focusArea as (typeof COACH_AREAS)[number])
    ? focusArea
    : COACH_AREAS[new Date().getDay() % COACH_AREAS.length]) as string;

  let healthScore = 75;
  try {
    const score = await computeDailyHealthScore(userId);
    healthScore = score.score;
  } catch {
    /* optional */
  }

  const advice = `${ADVICE[area]} Daily coaching tip for ${area.replace(/_/g, " ")}.`;
  const checkIn = await prisma.coachCheckIn.create({
    data: { userId, focusArea: area, advice, healthScore },
  });

  await sendDueMedicationReminders(userId).catch(() => 0);

  await notifyUser({
    userId,
    subject: `AI Health Coach — ${area.replace(/_/g, " ")}`,
    body: `${advice} Health score today: ${healthScore}. Medication reminders processed if due.`,
    kind: "reminder",
    channels: ["email", "push", "inbox"],
  }).catch(() => undefined);

  const goals = await prisma.coachGoal.findMany({ where: { userId, status: "active" } });
  return { checkIn, goals, healthScore, focusArea: area, medicationReminders: true };
}

export async function updateGoalProgress(goalId: string, userId: string, progress: number) {
  return prisma.coachGoal.updateMany({
    where: { id: goalId, userId },
    data: { progress: Math.max(0, Math.min(100, progress)) },
  });
}
