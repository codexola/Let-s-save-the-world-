import { config } from "./config";
import { prisma } from "./db";

export type InteractionAlert = {
  severity: "info" | "warning" | "critical";
  drugA: string;
  drugB: string;
  message: string;
};

const KNOWN_PAIRS: Array<{ a: string; b: string; severity: InteractionAlert["severity"]; message: string }> = [
  { a: "lisinopril", b: "ibuprofen", severity: "warning", message: "NSAIDs may reduce ACE inhibitor effect and worsen renal function." },
  { a: "enalapril", b: "ibuprofen", severity: "warning", message: "ACE inhibitor + NSAID — monitor renal function and BP." },
  { a: "metformin", b: "alcohol", severity: "warning", message: "Alcohol increases lactic acidosis risk with metformin." },
  { a: "warfarin", b: "ibuprofen", severity: "critical", message: "NSAID + anticoagulant — elevated bleeding risk." },
  { a: "warfarin", b: "acetaminophen", severity: "info", message: "High-dose acetaminophen may potentiate warfarin; monitor INR." },
  { a: "lisinopril", b: "potassium", severity: "warning", message: "ACE inhibitor + potassium — hyperkalemia risk." },
  { a: "metformin", b: "contrast", severity: "critical", message: "Hold metformin around iodinated contrast when renal risk present." },
];

function normalize(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9\u3040-\u30ff\u4e00-\u9faf]+/g, " ").trim();
}

export function checkMedicationInteractions(medications: string[]): InteractionAlert[] {
  const meds = medications.map(normalize).filter(Boolean);
  const alerts: InteractionAlert[] = [];
  for (const pair of KNOWN_PAIRS) {
    const hasA = meds.some((m) => m.includes(pair.a));
    const hasB = meds.some((m) => m.includes(pair.b));
    if (hasA && hasB) {
      alerts.push({
        severity: pair.severity,
        drugA: pair.a,
        drugB: pair.b,
        message: pair.message,
      });
    }
  }
  // Cross-check drug monographs
  return alerts;
}

export async function checkPatientMedicationInteractions(userId: string, additional: string[] = []) {
  const profile = await prisma.patientProfile.findUnique({ where: { userId } });
  const ehr = await prisma.electronicHealthRecord.findUnique({ where: { userId } });
  const rx = await prisma.prescription.findMany({
    where: { patientId: userId, status: { not: "EXPIRED" } },
    take: 50,
  });
  const bag = [
    ...(profile?.medications || "").split(/[,;\n]/),
    ...(profile?.allergies || "").split(/[,;\n]/).map((a) => `allergy:${a}`),
    ...(ehr?.treatments || "").split(/[,;\n]/),
    ...rx.map((r) => r.medication),
    ...additional,
  ]
    .map((s) => s.trim())
    .filter(Boolean);

  const alerts = checkMedicationInteractions(bag);

  // Allergy hits
  const allergies = (profile?.allergies || "")
    .split(/[,;\n]/)
    .map(normalize)
    .filter(Boolean);
  for (const med of additional.map(normalize)) {
    for (const a of allergies) {
      if (a && med.includes(a)) {
        alerts.push({
          severity: "critical",
          drugA: med,
          drugB: `allergy:${a}`,
          message: `Possible allergy conflict: patient allergy list includes "${a}".`,
        });
      }
    }
  }

  if (config.ai.enabled && alerts.length === 0 && bag.length >= 2) {
    // Optional LLM enrichment skipped when local rules suffice; keep deterministic for safety demos
  }

  return { medications: bag, alerts };
}

export async function summarizeMedicalDocument(text: string, locale = "en") {
  const clean = text.trim();
  if (!clean) throw new Error("Document text required");

  if (config.ai.enabled) {
    try {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.ai.openaiApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: config.ai.openaiModel,
          messages: [
            {
              role: "system",
              content:
                "You are a clinical documentation assistant. Summarize medical documents into: Chief complaint, Key findings, Diagnoses, Medications, Plan. Add disclaimer that this is not a substitute for clinician review. Respond in " +
                locale,
            },
            { role: "user", content: clean.slice(0, 12000) },
          ],
          temperature: 0.2,
        }),
      });
      if (res.ok) {
        const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
        const summary = data.choices?.[0]?.message?.content;
        if (summary) {
          return {
            summary,
            provider: "openai" as const,
            disclaimer: "AI summary — verify against source document; does not replace a physician.",
          };
        }
      }
    } catch {
      /* fall through */
    }
  }

  const lines = clean.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const head = lines.slice(0, 8).join(" ");
  const summary = [
    "Document summary (local heuristic)",
    "",
    `Length: ${clean.length} characters / ${lines.length} lines`,
    `Opening: ${head.slice(0, 400)}${head.length > 400 ? "…" : ""}`,
    "",
    "Sections detected: " +
      ["history", "lab", "imaging", "medication", "plan", "assessment"]
        .filter((k) => clean.toLowerCase().includes(k))
        .join(", ") || "general clinical text",
    "",
    "Disclaimer: This automated summary does not replace physician interpretation.",
  ].join("\n");

  return { summary, provider: "local-rules" as const, disclaimer: "Heuristic summary — clinician verification required." };
}

export async function translateClinicalText(text: string, targetLocale: string, sourceLocale = "auto") {
  const clean = text.trim();
  if (!clean) throw new Error("Text required");

  if (config.ai.enabled) {
    try {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.ai.openaiApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: config.ai.openaiModel,
          messages: [
            {
              role: "system",
              content: `Translate clinical consultation text to ${targetLocale}. Preserve medical terminology accuracy. Source language: ${sourceLocale}.`,
            },
            { role: "user", content: clean.slice(0, 8000) },
          ],
          temperature: 0.1,
        }),
      });
      if (res.ok) {
        const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
        const translated = data.choices?.[0]?.message?.content;
        if (translated) {
          return { translated, provider: "openai" as const, targetLocale };
        }
      }
    } catch {
      /* fall through */
    }
  }

  // Lightweight demo dictionary for common phrases
  const dict: Record<string, Record<string, string>> = {
    ja: {
      headache: "頭痛",
      fever: "発熱",
      cough: "咳",
      "blood pressure": "血圧",
      appointment: "予約",
      prescription: "処方箋",
    },
    en: {
      頭痛: "headache",
      発熱: "fever",
      咳: "cough",
      血圧: "blood pressure",
      予約: "appointment",
      処方箋: "prescription",
    },
  };
  let translated = clean;
  const map = dict[targetLocale.startsWith("ja") ? "ja" : "en"] || {};
  for (const [k, v] of Object.entries(map)) {
    translated = translated.replace(new RegExp(k, "gi"), v);
  }
  return {
    translated: `[${targetLocale}] ${translated}`,
    provider: "local-rules" as const,
    targetLocale,
  };
}

export type NoShowPrediction = {
  appointmentId: string;
  risk: number;
  level: "low" | "medium" | "high";
  factors: string[];
};

export async function predictNoShows(opts?: { doctorId?: string; limit?: number }) {
  const appts = await prisma.appointment.findMany({
    where: {
      status: { in: ["BOOKED", "WAITING_LIST"] },
      scheduledAt: { gte: new Date() },
      ...(opts?.doctorId ? { doctorId: opts.doctorId } : {}),
    },
    include: { patient: { select: { id: true } } },
    orderBy: { scheduledAt: "asc" },
    take: opts?.limit || 50,
  });

  const predictions: NoShowPrediction[] = [];
  for (const a of appts) {
    const history = await prisma.appointment.findMany({
      where: { patientId: a.patientId },
      select: { status: true },
      take: 50,
    });
    const total = history.length || 1;
    const cancelled = history.filter((h) => h.status === "CANCELLED").length;
    const noShows = history.filter((h) => h.status === "NO_SHOW").length;
    const leadHours = (a.scheduledAt.getTime() - Date.now()) / 3600000;
    const hour = a.scheduledAt.getHours();

    let risk = 0.12;
    const factors: string[] = [];
    const cancelRate = cancelled / total;
    const noShowRate = noShows / total;
    risk += cancelRate * 0.35;
    risk += noShowRate * 0.45;
    if (cancelRate > 0.2) factors.push(`prior cancel rate ${(cancelRate * 100).toFixed(0)}%`);
    if (noShowRate > 0) factors.push(`prior no-show rate ${(noShowRate * 100).toFixed(0)}%`);
    if (leadHours < 24) {
      risk += 0.08;
      factors.push("short lead time (<24h)");
    }
    if (leadHours > 72) {
      risk += 0.1;
      factors.push("long lead time (>72h)");
    }
    if (hour < 9 || hour > 17) {
      risk += 0.05;
      factors.push("off-peak slot");
    }
    if (a.type === "VIDEO") {
      risk -= 0.03;
      factors.push("video visit (slightly lower risk)");
    }
    risk = Math.max(0.02, Math.min(0.95, risk));
    const level = risk >= 0.55 ? "high" : risk >= 0.35 ? "medium" : "low";
    if (!factors.length) factors.push("baseline population risk");
    predictions.push({ appointmentId: a.id, risk: Math.round(risk * 100) / 100, level, factors });
  }

  return predictions.sort((a, b) => b.risk - a.risk);
}

export async function optimizeAppointmentSchedule(opts: {
  doctorId: string;
  day: Date;
}) {
  const start = new Date(opts.day);
  start.setHours(0, 0, 0, 0);
  const end = new Date(opts.day);
  end.setHours(23, 59, 59, 999);

  const booked = await prisma.appointment.findMany({
    where: {
      doctorId: opts.doctorId,
      scheduledAt: { gte: start, lte: end },
      status: { in: ["BOOKED", "RESCHEDULED", "COMPLETED"] },
    },
    orderBy: { scheduledAt: "asc" },
  });

  const waiting = await prisma.appointment.findMany({
    where: {
      doctorId: opts.doctorId,
      status: "WAITING_LIST",
    },
    orderBy: { createdAt: "asc" },
    take: 20,
  });

  // Working windows 9:00–12:00 and 13:00–17:00, 30-min slots
  const slots: Date[] = [];
  for (const [hStart, hEnd] of [
    [9, 12],
    [13, 17],
  ] as const) {
    for (let h = hStart; h < hEnd; h++) {
      for (const m of [0, 30]) {
        const slot = new Date(start);
        slot.setHours(h, m, 0, 0);
        if (slot.getTime() > Date.now()) slots.push(slot);
      }
    }
  }

  const taken = new Set(booked.map((b) => b.scheduledAt.getTime()));
  const free = slots.filter((s) => !taken.has(s.getTime()));
  const suggestions = waiting.slice(0, free.length).map((w, i) => ({
    appointmentId: w.id,
    from: "WAITING_LIST",
    suggestedAt: free[i].toISOString(),
    note: "Greedy pack from waiting list into free 30-min slots",
  }));

  const noShowRisk = await predictNoShows({ doctorId: opts.doctorId, limit: 20 });
  const highRisk = noShowRisk.filter((p) => p.level === "high");

  return {
    date: start.toISOString().slice(0, 10),
    bookedCount: booked.length,
    freeSlots: free.length,
    waitingCount: waiting.length,
    fillSuggestions: suggestions,
    highNoShowRisk: highRisk,
    recommendation:
      highRisk.length > 0
        ? `Send reminders to ${highRisk.length} high no-show-risk visits; optionally double-book late afternoon free slots.`
        : "Schedule healthy — optionally promote waiting-list patients into free slots.",
  };
}

export function forecastOccupancy(series: number[], periods = 4) {
  if (!series.length) return Array(periods).fill(0);
  const window = series.slice(-7);
  const avg = window.reduce((a, b) => a + b, 0) / window.length;
  const trend =
    window.length >= 2 ? (window[window.length - 1] - window[0]) / window.length : 0;
  return Array.from({ length: periods }, (_, i) =>
    Math.max(0, Math.min(100, Math.round(avg + trend * (i + 1))))
  );
}
