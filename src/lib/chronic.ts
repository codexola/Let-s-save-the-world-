import { prisma } from "./db";
import { notifyUser } from "./notify";
import { audit } from "./auth";
import { runRpmCheck } from "./rpm";

export const CHRONIC_CONDITIONS = [
  "Diabetes",
  "Hypertension",
  "Heart Disease",
  "Cancer",
  "Kidney Disease",
  "COPD",
  "Asthma",
  "Mental Health",
  "Alzheimer's Disease",
  "Parkinson's Disease",
  "Arthritis",
] as const;

const CARE_PLANS: Record<
  string,
  { lifestyle: string; nutrition: string; exercise: string; meds: Array<{ medication: string; dosage: string; schedule: string }>; metric: string }
> = {
  Diabetes: {
    lifestyle: "Monitor glucose, foot care daily, avoid tobacco.",
    nutrition: "Carb-aware plate method; prioritize fiber and lean protein; limit sugary drinks.",
    exercise: "150 min/week moderate aerobic + resistance 2×/week; check glucose before intense exercise.",
    meds: [{ medication: "Metformin", dosage: "500mg", schedule: "twice daily with meals" }],
    metric: "blood_sugar",
  },
  Hypertension: {
    lifestyle: "DASH habits, limit sodium, sleep 7–8h, stress reduction.",
    nutrition: "Low sodium (<2g/day), potassium-rich vegetables, limit alcohol.",
    exercise: "Brisk walking 30 min most days; avoid heavy isometric strain if uncontrolled BP.",
    meds: [{ medication: "Amlodipine", dosage: "5mg", schedule: "once daily morning" }],
    metric: "blood_pressure_systolic",
  },
  "Heart Disease": {
    lifestyle: "Cardiac rehab adherence, medication compliance, recognize angina red flags.",
    nutrition: "Mediterranean pattern; limit saturated fat and processed meats.",
    exercise: "Supervised aerobic progression; stop for chest pain/dyspnea.",
    meds: [{ medication: "Aspirin", dosage: "100mg", schedule: "once daily" }],
    metric: "heart_rate",
  },
  Cancer: {
    lifestyle: "Survivorship follow-up schedule; infection precautions during therapy.",
    nutrition: "Adequate protein and calories; antiemetic support as prescribed.",
    exercise: "Gentle mobility as tolerated; avoid overtraining during treatment.",
    meds: [{ medication: "Supportive care meds", dosage: "as prescribed", schedule: "per oncology plan" }],
    metric: "weight",
  },
  "Kidney Disease": {
    lifestyle: "Avoid nephrotoxins (NSAIDs); monitor edema and urine output.",
    nutrition: "Protein/phosphorus/potassium per renal dietitian plan.",
    exercise: "Low-impact walking; monitor BP response.",
    meds: [{ medication: "Losartan", dosage: "50mg", schedule: "once daily" }],
    metric: "blood_pressure_systolic",
  },
  COPD: {
    lifestyle: "Smoking cessation, inhaler technique, vaccinations up to date.",
    nutrition: "Small frequent meals; maintain healthy weight.",
    exercise: "Pulmonary rehab; paced walking with pursed-lip breathing.",
    meds: [{ medication: "Tiotropium", dosage: "18mcg", schedule: "once daily inhaled" }],
    metric: "respiration",
  },
  Asthma: {
    lifestyle: "Trigger avoidance; action plan for exacerbations; peak flow diary.",
    nutrition: "Maintain healthy weight; identify food triggers if allergic asthma.",
    exercise: "Warm-up; carry rescue inhaler; swimming or walking preferred.",
    meds: [{ medication: "Budesonide/formoterol", dosage: "as prescribed", schedule: "maintenance + reliever plan" }],
    metric: "respiration",
  },
  "Mental Health": {
    lifestyle: "Sleep hygiene, social connection, crisis plan if needed.",
    nutrition: "Regular meals; limit excess caffeine/alcohol.",
    exercise: "Aerobic activity 3–5×/week shown to support mood.",
    meds: [{ medication: "As prescribed by psychiatrist", dosage: "per plan", schedule: "daily" }],
    metric: "stress",
  },
  "Alzheimer's Disease": {
    lifestyle: "Routine, caregiver support, fall-proof environment, cognitive engagement.",
    nutrition: "Hydration; finger foods if needed; monitor weight loss.",
    exercise: "Supervised walking and balance activities.",
    meds: [{ medication: "Donepezil", dosage: "5–10mg", schedule: "once daily evening" }],
    metric: "sleep",
  },
  "Parkinson's Disease": {
    lifestyle: "Medication timing critical; fall prevention; speech/swallow follow-up.",
    nutrition: "Protein timing around levodopa if advised; fiber for constipation.",
    exercise: "Amplitude-based PT; balance and flexibility daily.",
    meds: [{ medication: "Levodopa/carbidopa", dosage: "as prescribed", schedule: "timed doses" }],
    metric: "exercise_minutes",
  },
  Arthritis: {
    lifestyle: "Joint protection, heat/cold, maintain healthy weight.",
    nutrition: "Anti-inflammatory pattern (omega-3, vegetables); limit ultra-processed foods.",
    exercise: "Low-impact (swim, cycle); daily range-of-motion.",
    meds: [{ medication: "NSAID as prescribed", dosage: "lowest effective", schedule: "with food if GI risk" }],
    metric: "exercise_minutes",
  },
};

export async function enrollChronic(opts: {
  userId: string;
  condition: string;
  doctorId?: string;
}) {
  if (!CHRONIC_CONDITIONS.includes(opts.condition as (typeof CHRONIC_CONDITIONS)[number])) {
    throw new Error("Unsupported chronic condition");
  }
  const plan = CARE_PLANS[opts.condition] || CARE_PLANS.Hypertension;
  const nextFollowUp = new Date(Date.now() + 30 * 86400_000);
  const condition = await prisma.chronicCondition.upsert({
    where: { userId_condition: { userId: opts.userId, condition: opts.condition } },
    update: {
      status: "active",
      lifestyleAdvice: plan.lifestyle,
      nutritionAdvice: plan.nutrition,
      exercisePlan: plan.exercise,
      aiMonitoringNotes: `AI monitoring enabled for ${opts.condition} (metric focus: ${plan.metric}).`,
      nextFollowUpAt: nextFollowUp,
      doctorId: opts.doctorId,
    },
    create: {
      userId: opts.userId,
      condition: opts.condition,
      diagnosedAt: new Date(),
      doctorId: opts.doctorId,
      lifestyleAdvice: plan.lifestyle,
      nutritionAdvice: plan.nutrition,
      exercisePlan: plan.exercise,
      aiMonitoringNotes: `AI monitoring enabled for ${opts.condition} (metric focus: ${plan.metric}).`,
      nextFollowUpAt: nextFollowUp,
      goalsJson: JSON.stringify({ targetAdherence: 90, checkInsPerWeek: 3 }),
      progressScore: 70,
    },
  });

  for (const m of plan.meds) {
    const existing = await prisma.chronicMedReminder.findFirst({
      where: { userId: opts.userId, conditionId: condition.id, medication: m.medication },
    });
    if (!existing) {
      await prisma.chronicMedReminder.create({
        data: {
          userId: opts.userId,
          conditionId: condition.id,
          medication: m.medication,
          dosage: m.dosage,
          schedule: m.schedule,
          nextDueAt: new Date(Date.now() + 8 * 3600_000),
          active: true,
        },
      });
    }
  }

  await notifyUser({
    userId: opts.userId,
    subject: `Chronic care plan: ${opts.condition}`,
    body: `You are enrolled in ${opts.condition} management. Medication reminders, lifestyle/nutrition/exercise coaching, and AI monitoring are active. Next doctor follow-up ~${nextFollowUp.toLocaleDateString()}.`,
    kind: "reminder",
    channels: ["email", "push", "inbox"],
  }).catch(() => undefined);

  await audit(opts.userId, "chronic.enroll", "ChronicCondition", condition.id);
  return condition;
}

export async function logChronicProgress(opts: {
  userId: string;
  conditionId: string;
  metric: string;
  value: number;
  unit?: string;
  note?: string;
}) {
  const log = await prisma.chronicProgressLog.create({
    data: {
      userId: opts.userId,
      conditionId: opts.conditionId,
      metric: opts.metric,
      value: opts.value,
      unit: opts.unit,
      note: opts.note,
    },
  });
  const logs = await prisma.chronicProgressLog.findMany({
    where: { conditionId: opts.conditionId },
    orderBy: { recordedAt: "desc" },
    take: 10,
  });
  const avg = logs.reduce((s, l) => s + l.value, 0) / (logs.length || 1);
  const score = Math.max(40, Math.min(100, Math.round(85 - Math.abs(avg - opts.value) * 0.5)));
  await prisma.chronicCondition.update({
    where: { id: opts.conditionId },
    data: { progressScore: score },
  });
  return log;
}

export async function sendDueMedicationReminders(userId?: string) {
  const now = new Date();
  const due = await prisma.chronicMedReminder.findMany({
    where: {
      active: true,
      nextDueAt: { lte: now },
      ...(userId ? { userId } : {}),
    },
    take: 100,
  });
  let sent = 0;
  for (const r of due) {
    await notifyUser({
      userId: r.userId,
      subject: "Medication reminder",
      body: `Time to take ${r.medication}${r.dosage ? ` (${r.dosage})` : ""} — ${r.schedule}.`,
      kind: "prescription",
      channels: ["email", "sms", "push", "line"],
    }).catch(() => undefined);
    await prisma.chronicMedReminder.update({
      where: { id: r.id },
      data: {
        lastSentAt: now,
        nextDueAt: new Date(now.getTime() + 12 * 3600_000),
      },
    });
    sent += 1;
  }
  return sent;
}

export async function runChronicAiMonitoring(userId: string) {
  const conditions = await prisma.chronicCondition.findMany({
    where: { userId, status: "active" },
    include: { reminders: true, progressLogs: { orderBy: { recordedAt: "desc" }, take: 5 } },
  });
  let rpm = null;
  try {
    rpm = await runRpmCheck(userId, userId);
  } catch {
    /* optional */
  }
  const notes = conditions.map((c) => {
    const latest = c.progressLogs[0];
    return `${c.condition}: score ${c.progressScore ?? "—"} · last ${latest ? `${latest.metric}=${latest.value}` : "no progress log"} · follow-up ${c.nextFollowUpAt?.toISOString().slice(0, 10) || "n/a"}`;
  });
  for (const c of conditions) {
    await prisma.chronicCondition.update({
      where: { id: c.id },
      data: {
        aiMonitoringNotes: `AI check ${new Date().toISOString()}: ${notes.find((n) => n.startsWith(c.condition))}. Correlate with RPM alerts.`,
        lastFollowUpAt: c.lastFollowUpAt,
      },
    });
  }
  await sendDueMedicationReminders(userId);
  return { conditions: conditions.length, notes, rpmAlerts: rpm?.alerts?.length || 0, score: rpm?.score };
}

export async function scheduleDoctorFollowUp(conditionId: string, days = 14) {
  const at = new Date(Date.now() + days * 86400_000);
  return prisma.chronicCondition.update({
    where: { id: conditionId },
    data: { nextFollowUpAt: at, lastFollowUpAt: new Date() },
  });
}
