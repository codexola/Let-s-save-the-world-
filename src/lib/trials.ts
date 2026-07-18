import { prisma } from "./db";
import { notifyUser } from "./notify";
import { audit } from "./auth";

export async function ensureTrialsSeed(researcherId?: string) {
  const count = await prisma.clinicalTrial.count();
  if (count > 0) return;
  let rid = researcherId;
  if (!rid) {
    let researcher = await prisma.user.findFirst({ where: { email: "researcher@medcare.local" } });
    if (!researcher) {
      const bcrypt = await import("bcryptjs");
      researcher = await prisma.user.create({
        data: {
          email: "researcher@medcare.local",
          name: "Dr. Research Lead",
          role: "RESEARCHER",
          passwordHash: await bcrypt.hash("Research!2026", 10),
          active: true,
          verified: true,
        },
      });
    }
    rid = researcher.id;
  }

  const trials = [
    {
      title: "SGLT2 inhibitor outcomes in early HFrEF",
      studyType: "interventional",
      description: "Phase III multi-center study of SGLT2i vs standard care.",
      eligibility: "Age 40–80; HFrEF EF≤40%; hypertension or diabetes OK",
      exclusion: "eGFR <30; pregnancy; recent MI <30 days",
      compensation: "¥50,000 travel stipend + free labs",
      location: "Tokyo Central Hospital",
      consentForm: "I understand the risks/benefits of this interventional trial and consent to participate voluntarily. Data may be used for research under privacy policy.",
      scheduleNotes: "Baseline, week 4, week 12, week 24 visits",
      monitoringPlan: "AE reporting, labs, ECG, adherence diary",
      tags: "cardiology,heart failure,diabetes",
      targetEnrollment: 120,
    },
    {
      title: "Digital CBT for mild anxiety — remote trial",
      studyType: "interventional",
      description: "App-based CBT vs waitlist for mild anxiety.",
      eligibility: "Age 18–65; GAD-7 5–14; smartphone access",
      exclusion: "Active psychosis; current psychotherapy",
      compensation: "¥20,000 completion bonus",
      location: "Remote / Tokyo metro",
      consentForm: "I consent to remote digital CBT research, symptom surveys, and encrypted data storage.",
      scheduleNotes: "Weekly app modules for 8 weeks + 2 tele visits",
      monitoringPlan: "Weekly GAD-7, adverse mood flags, dropout monitoring",
      tags: "mental health,digital,anxiety",
      targetEnrollment: 200,
    },
    {
      title: "Home PT early mobilization after knee arthroplasty",
      studyType: "observational",
      description: "Observational registry of home physical therapy outcomes.",
      eligibility: "Age ≥50; TKA within 14 days; able to ambulate with assist",
      exclusion: "Unstable angina; non-weight-bearing orders",
      compensation: "Device kit provided",
      location: "Home visits — Greater Tokyo",
      consentForm: "I consent to share home PT progress metrics for observational research.",
      scheduleNotes: "PT visits 3×/week × 4 weeks",
      monitoringPlan: "Pain scores, ROM, fall events",
      tags: "rehab,orthopedics,home care",
      targetEnrollment: 80,
    },
  ];

  for (const t of trials) {
    await prisma.clinicalTrial.create({
      data: { ...t, researcherId: rid, status: "recruiting", latitude: 35.6812, longitude: 139.7671 },
    });
  }
}

export function aiMatchScore(trial: {
  eligibility: string | null;
  exclusion: string | null;
  tags: string | null;
  title: string;
}, patient: {
  diagnoses?: string | null;
  ageHint?: number;
  conditions?: string[];
}) {
  const text = `${trial.eligibility || ""} ${trial.tags || ""} ${trial.title}`.toLowerCase();
  const patientBlob = `${patient.diagnoses || ""} ${(patient.conditions || []).join(" ")}`.toLowerCase();
  let score = 40;
  const reasons: string[] = [];
  const keywords = ["hypertension", "diabetes", "heart", "anxiety", "rehab", "knee", "asthma", "copd"];
  for (const k of keywords) {
    if (text.includes(k) && patientBlob.includes(k)) {
      score += 12;
      reasons.push(`Matched on ${k}`);
    }
  }
  if (trial.exclusion && patientBlob && trial.exclusion.toLowerCase().includes("pregnancy") && !patientBlob.includes("pregnan")) {
    score += 5;
    reasons.push("No exclusion conflict detected (demo)");
  }
  if (!reasons.length) reasons.push("General demographic fit (demo AI)");
  return { score: Math.min(98, score), reasons };
}

export async function publishTrial(opts: {
  researcherId: string;
  title: string;
  eligibility?: string;
  compensation?: string;
  location?: string;
  consentForm?: string;
  description?: string;
  scheduleNotes?: string;
  monitoringPlan?: string;
  tags?: string;
}) {
  const trial = await prisma.clinicalTrial.create({
    data: {
      researcherId: opts.researcherId,
      title: opts.title,
      eligibility: opts.eligibility,
      compensation: opts.compensation,
      location: opts.location,
      consentForm: opts.consentForm || "Standard research informed consent applies.",
      description: opts.description,
      scheduleNotes: opts.scheduleNotes,
      monitoringPlan: opts.monitoringPlan,
      tags: opts.tags,
      status: "recruiting",
    },
  });
  await audit(opts.researcherId, "trial.publish", "ClinicalTrial", trial.id);
  return trial;
}

export async function applyToTrial(opts: {
  trialId: string;
  patientId: string;
  signConsent?: boolean;
}) {
  const trial = await prisma.clinicalTrial.findUnique({ where: { id: opts.trialId } });
  if (!trial) throw new Error("Trial not found");
  const ehr = await prisma.electronicHealthRecord.findUnique({ where: { userId: opts.patientId } });
  const chronic = await prisma.chronicCondition.findMany({ where: { userId: opts.patientId } });
  const match = aiMatchScore(trial, {
    diagnoses: ehr?.diagnoses,
    conditions: chronic.map((c) => c.condition),
  });
  const participation = await prisma.trialParticipation.upsert({
    where: { trialId_patientId: { trialId: opts.trialId, patientId: opts.patientId } },
    update: {
      matchScore: match.score,
      matchReasons: JSON.stringify(match.reasons),
      consentSignedAt: opts.signConsent ? new Date() : undefined,
      status: opts.signConsent ? "consented" : "applied",
    },
    create: {
      trialId: opts.trialId,
      patientId: opts.patientId,
      matchScore: match.score,
      matchReasons: JSON.stringify(match.reasons),
      consentSignedAt: opts.signConsent ? new Date() : null,
      status: opts.signConsent ? "consented" : "applied",
      scheduledAt: new Date(Date.now() + 7 * 86400_000),
    },
  });
  if (opts.signConsent) {
    await prisma.clinicalTrial.update({
      where: { id: opts.trialId },
      data: { enrolledCount: { increment: 1 } },
    });
  }
  await notifyUser({
    userId: opts.patientId,
    subject: `Trial application: ${trial.title}`,
    body: `AI match score ${match.score}. Status: ${participation.status}.`,
    kind: "general",
    channels: ["email", "push"],
  }).catch(() => undefined);
  if (trial.researcherId) {
    await notifyUser({
      userId: trial.researcherId,
      subject: "Patient recruitment interest",
      body: `Patient applied to ${trial.title} (match ${match.score}).`,
      kind: "general",
      channels: ["email", "push"],
    }).catch(() => undefined);
  }
  return { participation, match };
}

export async function updateParticipation(opts: {
  id: string;
  status?: string;
  monitoringNotes?: string;
  resultNotes?: string;
  scheduledAt?: string;
}) {
  return prisma.trialParticipation.update({
    where: { id: opts.id },
    data: {
      status: opts.status,
      monitoringNotes: opts.monitoringNotes,
      resultNotes: opts.resultNotes,
      scheduledAt: opts.scheduledAt ? new Date(opts.scheduledAt) : undefined,
    },
  });
}
