import { config } from "./config";
import { prisma } from "./db";

const EMERGENCY_KEYWORDS = [
  "chest pain",
  "cannot breathe",
  "can't breathe",
  "unconscious",
  "severe bleeding",
  "stroke",
  "heart attack",
  "suicidal",
  "心臓",
  "息ができない",
  "意識不明",
  "大出血",
  "心筋梗塞",
  "脳卒中",
];

export type DiseasePrediction = {
  name: string;
  probability: number;
  icdHint?: string;
};

export type ProviderRec = {
  id: string;
  name: string;
  specialty?: string | null;
  distanceKm?: number | null;
  reason: string;
};

export type MedicationRec = {
  name: string;
  type: "otc_suggestion" | "rx_consideration" | "avoid";
  note: string;
  marketplaceId?: string;
};

export type AppointmentSuggestion = {
  type: "VIDEO" | "IN_PERSON" | "HOME_VISIT" | "EMERGENCY";
  specialty: string;
  urgency: string;
  preferredWithinHours: number;
  note: string;
};

export type ConsultResult = {
  analysis: string;
  riskLevel: "low" | "moderate" | "high" | "critical";
  specialty: string;
  recommendations: string;
  emergency: boolean;
  diseasePredictions: DiseasePrediction[];
  medications: MedicationRec[];
  lifestyleAdvice: string;
  nutritionAdvice: string;
  mentalHealthAdvice: string;
  recommendedHospitals: ProviderRec[];
  recommendedDoctors: ProviderRec[];
  recommendedNurses: ProviderRec[];
  nearbyProviders: ProviderRec[];
  appointmentSuggestion: AppointmentSuggestion;
  followUpHours: number;
  provider: "openai" | "local-rules";
};

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function predictDiseases(symptoms: string, riskLevel: string): DiseasePrediction[] {
  const lower = symptoms.toLowerCase();
  const preds: DiseasePrediction[] = [];

  if (/fever|熱|cough|咳|sore throat|喉/.test(lower)) {
    preds.push({ name: "Upper respiratory infection / cold", probability: 0.55, icdHint: "J06" });
    preds.push({ name: "Influenza-like illness", probability: 0.28, icdHint: "J11" });
    preds.push({ name: "COVID-19 / viral pharyngitis (consider test)", probability: 0.18, icdHint: "U07.1" });
  }
  if (/headache|頭痛|migraine|偏頭痛/.test(lower)) {
    preds.push({ name: "Tension-type headache", probability: 0.48, icdHint: "G44.2" });
    preds.push({ name: "Migraine", probability: 0.32, icdHint: "G43" });
  }
  if (/dizzy|めまい|vertigo/.test(lower)) {
    preds.push({ name: "Vestibular / orthostatic dizziness", probability: 0.4, icdHint: "R42" });
  }
  if (/chest pain|胸痛|心臓/.test(lower)) {
    preds.push({ name: "Cardiac ischemia (urgent evaluation)", probability: 0.35, icdHint: "I20" });
    preds.push({ name: "Musculoskeletal chest pain", probability: 0.25, icdHint: "M79" });
  }
  if (/anxiety|不安|depression|うつ|sleep|不眠|stress|ストレス/.test(lower)) {
    preds.push({ name: "Anxiety / stress-related symptoms", probability: 0.45, icdHint: "F41" });
    preds.push({ name: "Sleep disturbance", probability: 0.3, icdHint: "G47" });
  }
  if (/stomach|腹痛|nausea|吐き気|diarrhea|下痢/.test(lower)) {
    preds.push({ name: "Gastroenteritis", probability: 0.5, icdHint: "A09" });
    preds.push({ name: "Functional dyspepsia", probability: 0.22, icdHint: "K30" });
  }
  if (/rash|発疹|itch|かゆ/.test(lower)) {
    preds.push({ name: "Allergic dermatitis / urticaria", probability: 0.42, icdHint: "L50" });
  }
  if (preds.length === 0) {
    preds.push({
      name: "Non-specific symptoms — primary care evaluation recommended",
      probability: riskLevel === "low" ? 0.35 : 0.5,
    });
  }
  return preds
    .sort((a, b) => b.probability - a.probability)
    .slice(0, 5)
    .map((p) => ({ ...p, probability: Math.round(p.probability * 100) / 100 }));
}

function medicationRecs(symptoms: string, emergency: boolean): MedicationRec[] {
  if (emergency) {
    return [
      {
        name: "Do not self-medicate",
        type: "avoid",
        note: "Seek emergency care before taking any medication",
      },
    ];
  }
  const lower = symptoms.toLowerCase();
  const meds: MedicationRec[] = [];
  if (/fever|熱|pain|痛|頭痛/.test(lower)) {
    meds.push({
      name: "Acetaminophen (paracetamol)",
      type: "otc_suggestion",
      note: "For fever/pain if no liver disease; follow package dosing",
    });
  }
  if (/cough|咳|sore throat|喉|allergy|アレルギー|rash|発疹/.test(lower)) {
    meds.push({
      name: "Antihistamine (non-drowsy if daytime)",
      type: "otc_suggestion",
      note: "May help allergic rhinitis or mild urticaria",
    });
  }
  if (/stomach|腹痛|nausea|下痢|diarrhea/.test(lower)) {
    meds.push({
      name: "Oral rehydration solution",
      type: "otc_suggestion",
      note: "Prioritize hydration; avoid anti-diarrheals if bloody stool/fever",
    });
  }
  if (/anxiety|不眠|stress/.test(lower)) {
    meds.push({
      name: "Prescription anxiolytics / sleep aids",
      type: "rx_consideration",
      note: "Only after clinician assessment — do not start without prescription",
    });
  }
  if (meds.length === 0) {
    meds.push({
      name: "No specific OTC recommendation",
      type: "otc_suggestion",
      note: "Discuss with a pharmacist or physician before new medications",
    });
  }
  return meds;
}

function lifestyleFor(symptoms: string, risk: string): string {
  const lower = symptoms.toLowerCase();
  const parts = [
    "Rest adequately and avoid strenuous activity until symptoms improve.",
    "Monitor temperature and symptom progression every 4–6 hours.",
  ];
  if (/fever|熱|cough|咳/.test(lower)) {
    parts.push("Isolate if contagious illness is possible; ventilate rooms.");
  }
  if (/headache|頭痛|stress|anxiety/.test(lower)) {
    parts.push("Limit screen time, use dim lighting, and practice paced breathing.");
  }
  if (risk === "high" || risk === "critical") {
    parts.push("Avoid driving yourself if symptoms worsen — call emergency services.");
  }
  return parts.join(" ");
}

function nutritionFor(symptoms: string): string {
  const lower = symptoms.toLowerCase();
  if (/stomach|腹痛|nausea|下痢|diarrhea|vomiting/.test(lower)) {
    return "Prefer clear fluids, oral rehydration, and bland foods (rice, banana, toast). Avoid alcohol, spicy, and high-fat meals until recovered.";
  }
  if (/fever|熱|cough|咳/.test(lower)) {
    return "Increase fluid intake (water, warm soups). Light, protein-rich meals support recovery. Limit caffeine and alcohol.";
  }
  if (/anxiety|stress|depression|うつ/.test(lower)) {
    return "Regular meals with complex carbs, omega-3 sources, and limited caffeine/alcohol can support mood stability.";
  }
  return "Maintain balanced meals, adequate protein, fruits/vegetables, and consistent hydration (about 1.5–2L/day unless restricted).";
}

function mentalHealthFor(symptoms: string, emergency: boolean): string {
  if (emergency || /suicidal|自傷|kill myself/.test(symptoms.toLowerCase())) {
    return "If you are in crisis or having thoughts of self-harm, contact emergency services (119) or a crisis hotline immediately. You are not alone.";
  }
  if (/anxiety|不安|depression|うつ|stress|ストレス|sleep|不眠/.test(symptoms.toLowerCase())) {
    return "Symptoms may have a mental-health component. Consider grounding exercises (5-4-3-2-1), short walks, and booking a mental health or primary care visit. Persistent low mood >2 weeks warrants professional support.";
  }
  return "Illness can increase worry. Use brief relaxation, stay connected with trusted people, and seek care if anxiety interferes with daily life.";
}

function specialtyFromSymptoms(symptoms: string, emergency: boolean): string {
  const lower = symptoms.toLowerCase();
  if (emergency) return "Emergency Medicine";
  if (/anxiety|depression|うつ|mental|精神|不眠/.test(lower)) return "Psychiatry / Mental Health";
  if (/skin|rash|発疹|itch/.test(lower)) return "Dermatology";
  if (/stomach|腹痛|nausea|下痢/.test(lower)) return "Gastroenterology / Internal Medicine";
  if (/fever|熱|cough|咳|sore throat|喉/.test(lower)) return "Internal Medicine / ENT";
  if (/headache|頭痛|dizzy|めまい|stroke/.test(lower)) return "Neurology / General Practice";
  if (/chest|心臓|breath|息/.test(lower)) return "Cardiology / Pulmonology";
  if (/pregnancy|妊婦|gyn/.test(lower)) return "Obstetrics & Gynecology";
  if (/child|小児|infant/.test(lower)) return "Pediatrics";
  return "General Practice";
}

async function matchProviders(
  specialty: string,
  lat?: number,
  lng?: number
): Promise<{
  hospitals: ProviderRec[];
  doctors: ProviderRec[];
  nurses: ProviderRec[];
  nearby: ProviderRec[];
}> {
  const specialtyKey = specialty.split("/")[0].trim();

  const doctors = await prisma.user.findMany({
    where: {
      role: "DOCTOR",
      active: true,
      doctorProfile: { is: { verified: true } },
    },
    include: { doctorProfile: true },
    take: 40,
  });

  const nurses = await prisma.user.findMany({
    where: {
      role: "NURSE",
      active: true,
      nurseProfile: { is: {} },
    },
    include: { nurseProfile: true },
    take: 40,
  });

  const hospitals = await prisma.hospitalProfile.findMany({
    where: { verified: true },
    include: { user: true },
    take: 40,
  });

  const scoredDoctors = doctors
    .map((d) => {
      const spec = d.doctorProfile?.specialty || "";
      const match =
        spec.toLowerCase().includes(specialtyKey.toLowerCase()) ||
        specialtyKey.toLowerCase().includes(spec.toLowerCase().split(" ")[0] || "zzz");
      return {
        id: d.id,
        name: d.name,
        specialty: spec,
        distanceKm: null as number | null,
        reason: match
          ? `Specialty match: ${spec || specialty}`
          : `Verified physician — consider for ${specialty}`,
        score: match ? 2 : 1,
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map(({ score: _s, ...rest }) => rest);

  const scoredNurses = nurses
    .map((n) => {
      const spec = n.nurseProfile?.specialty || n.nurseProfile?.clinicalSpecialties || "";
      return {
        id: n.id,
        name: n.name,
        specialty: spec,
        distanceKm: null as number | null,
        reason: n.nurseProfile?.homeVisitAvailable
          ? "Home-visit capable nurse"
          : "Available nursing support",
      };
    })
    .slice(0, 5);

  const hospitalRecs: ProviderRec[] = hospitals.map((h) => {
    let distanceKm: number | null = null;
    if (
      lat != null &&
      lng != null &&
      h.latitude != null &&
      h.longitude != null
    ) {
      distanceKm = Math.round(haversineKm(lat, lng, h.latitude, h.longitude) * 10) / 10;
    }
    const deptMatch = (h.departments || "")
      .toLowerCase()
      .includes(specialtyKey.toLowerCase().split(" ")[0]);
    return {
      id: h.userId,
      name: h.name,
      specialty: h.departments,
      distanceKm,
      reason: [
        deptMatch ? "Department match" : "Verified hospital",
        h.emergencyAvailable ? "Emergency available" : null,
        distanceKm != null ? `${distanceKm} km away` : null,
      ]
        .filter(Boolean)
        .join(" · "),
    };
  });

  hospitalRecs.sort((a, b) => {
    if (a.distanceKm != null && b.distanceKm != null) return a.distanceKm - b.distanceKm;
    if (a.distanceKm != null) return -1;
    if (b.distanceKm != null) return 1;
    return a.name.localeCompare(b.name);
  });

  const nearby: ProviderRec[] = [
    ...hospitalRecs.slice(0, 3),
    ...scoredDoctors.slice(0, 2).map((d) => ({
      ...d,
      reason: `Nearby doctor · ${d.reason}`,
    })),
  ];

  return {
    hospitals: hospitalRecs.slice(0, 5),
    doctors: scoredDoctors,
    nurses: scoredNurses,
    nearby: nearby.slice(0, 6),
  };
}

function appointmentSuggestion(
  specialty: string,
  riskLevel: string,
  emergency: boolean
): AppointmentSuggestion {
  if (emergency) {
    return {
      type: "EMERGENCY",
      specialty: "Emergency Medicine",
      urgency: "immediate",
      preferredWithinHours: 0,
      note: "Call 119 / go to the nearest ER now",
    };
  }
  if (riskLevel === "high") {
    return {
      type: "IN_PERSON",
      specialty,
      urgency: "urgent",
      preferredWithinHours: 6,
      note: "Book same-day in-person or urgent care visit",
    };
  }
  if (riskLevel === "moderate") {
    return {
      type: "VIDEO",
      specialty,
      urgency: "soon",
      preferredWithinHours: 24,
      note: "Telemedicine within 24 hours is appropriate if stable",
    };
  }
  return {
    type: "VIDEO",
    specialty,
    urgency: "routine",
    preferredWithinHours: 72,
    note: "Routine primary care / telemedicine within 2–3 days",
  };
}

function followUpHours(riskLevel: string, emergency: boolean): number {
  if (emergency) return 1;
  if (riskLevel === "high") return 12;
  if (riskLevel === "moderate") return 48;
  return 72;
}

async function enrichLocal(base: Omit<ConsultResult, "recommendedHospitals" | "recommendedDoctors" | "recommendedNurses" | "nearbyProviders" | "provider"> & { provider?: ConsultResult["provider"] }, lat?: number, lng?: number): Promise<ConsultResult> {
  const matched = await matchProviders(base.specialty, lat, lng);
  return {
    ...base,
    recommendedHospitals: matched.hospitals,
    recommendedDoctors: matched.doctors,
    recommendedNurses: matched.nurses,
    nearbyProviders: matched.nearby,
    provider: base.provider || "local-rules",
  };
}

function localTriage(symptoms: string): Omit<
  ConsultResult,
  "recommendedHospitals" | "recommendedDoctors" | "recommendedNurses" | "nearbyProviders"
> {
  const lower = symptoms.toLowerCase();
  const emergency = EMERGENCY_KEYWORDS.some((k) => lower.includes(k.toLowerCase()));

  let riskLevel: ConsultResult["riskLevel"] = "low";
  const specialty = specialtyFromSymptoms(symptoms, emergency);
  const recs: string[] = [];

  if (emergency) {
    riskLevel = "critical";
    recs.push("Call emergency services immediately (119 in Japan)");
  } else if (/fever|熱|cough|咳|sore throat|喉/.test(lower)) {
    riskLevel = "moderate";
    recs.push("Rest, hydrate, monitor temperature");
    recs.push("Consider booking a telemedicine visit if symptoms persist >48h");
  } else if (/headache|頭痛|dizzy|めまい/.test(lower)) {
    riskLevel = "moderate";
    recs.push("Rest in a quiet environment and monitor neurological symptoms");
  } else if (/anxiety|depression|うつ|stress|不眠/.test(lower)) {
    riskLevel = "moderate";
    recs.push("Consider mental health support and sleep hygiene measures");
  } else if (/chest|息|breath/.test(lower)) {
    riskLevel = "high";
    recs.push("Seek urgent evaluation if pain radiates or breathing worsens");
  } else {
    recs.push("Monitor symptoms and book a primary care visit");
  }

  const diseasePredictions = predictDiseases(symptoms, riskLevel);
  const medications = medicationRecs(symptoms, emergency);
  const lifestyleAdvice = lifestyleFor(symptoms, riskLevel);
  const nutritionAdvice = nutritionFor(symptoms);
  const mentalHealthAdvice = mentalHealthFor(symptoms, emergency);
  const appointment = appointmentSuggestion(specialty, riskLevel, emergency);

  const analysis = [
    "AI Medical Consultant analysis (does not replace a physician).",
    `Reported symptoms: ${symptoms}`,
    `Suggested specialty: ${specialty}`,
    `Risk level: ${riskLevel}`,
    `Possible conditions (not a diagnosis): ${diseasePredictions.map((d) => `${d.name} (${Math.round(d.probability * 100)}%)`).join("; ")}`,
  ].join("\n");

  return {
    analysis,
    riskLevel,
    specialty,
    recommendations: recs.join(" | "),
    emergency,
    diseasePredictions,
    medications,
    lifestyleAdvice,
    nutritionAdvice,
    mentalHealthAdvice,
    appointmentSuggestion: appointment,
    followUpHours: followUpHours(riskLevel, emergency),
    provider: "local-rules",
  };
}

export async function consultSymptoms(
  symptoms: string,
  opts?: { latitude?: number; longitude?: number }
): Promise<ConsultResult> {
  const lat = opts?.latitude;
  const lng = opts?.longitude;

  if (!config.ai.enabled) {
    return enrichLocal(localTriage(symptoms), lat, lng);
  }

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
              "You are a medical triage assistant. Respond in JSON with keys: analysis, riskLevel (low|moderate|high|critical), specialty, recommendations (pipe-separated), emergency (boolean), diseasePredictions (array of {name,probability,icdHint}), medications (array of {name,type,note}), lifestyleAdvice, nutritionAdvice, mentalHealthAdvice, appointmentSuggestion ({type,specialty,urgency,preferredWithinHours,note}), followUpHours (number). Never diagnose definitively. Probabilities are illustrative only.",
          },
          { role: "user", content: symptoms },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!res.ok) {
      return enrichLocal(localTriage(symptoms), lat, lng);
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content;
    if (!content) return enrichLocal(localTriage(symptoms), lat, lng);

    const parsed = JSON.parse(content) as Partial<ConsultResult>;
    const fallback = localTriage(symptoms);
    const merged = {
      analysis: String(parsed.analysis || fallback.analysis),
      riskLevel: (parsed.riskLevel as ConsultResult["riskLevel"]) || fallback.riskLevel,
      specialty: String(parsed.specialty || fallback.specialty),
      recommendations: String(parsed.recommendations || fallback.recommendations),
      emergency: Boolean(parsed.emergency),
      diseasePredictions: parsed.diseasePredictions?.length
        ? parsed.diseasePredictions
        : fallback.diseasePredictions,
      medications: parsed.medications?.length ? parsed.medications : fallback.medications,
      lifestyleAdvice: String(parsed.lifestyleAdvice || fallback.lifestyleAdvice),
      nutritionAdvice: String(parsed.nutritionAdvice || fallback.nutritionAdvice),
      mentalHealthAdvice: String(parsed.mentalHealthAdvice || fallback.mentalHealthAdvice),
      appointmentSuggestion: parsed.appointmentSuggestion || fallback.appointmentSuggestion,
      followUpHours: Number(parsed.followUpHours || fallback.followUpHours),
      provider: "openai" as const,
    };
    return enrichLocal(merged, lat, lng);
  } catch {
    return enrichLocal(localTriage(symptoms), lat, lng);
  }
}
