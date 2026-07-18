import { config } from "./config";

const EMERGENCY_KEYWORDS = [
  "chest pain",
  "cannot breathe",
  "unconscious",
  "severe bleeding",
  "stroke",
  "心臓",
  "息ができない",
  "意識不明",
  "大出血",
];

export type ConsultResult = {
  analysis: string;
  riskLevel: string;
  specialty: string;
  recommendations: string;
  emergency: boolean;
  provider: "openai" | "local-rules";
};

function localTriage(symptoms: string): ConsultResult {
  const lower = symptoms.toLowerCase();
  const emergency = EMERGENCY_KEYWORDS.some((k) => lower.includes(k.toLowerCase()));

  let riskLevel = "low";
  let specialty = "General Practice";
  const recs: string[] = [];

  if (emergency) {
    riskLevel = "critical";
    specialty = "Emergency Medicine";
    recs.push("Call emergency services immediately (119 in Japan)");
  } else if (/fever|熱|cough|咳|sore throat/.test(lower)) {
    riskLevel = "moderate";
    specialty = "Internal Medicine / ENT";
    recs.push("Rest, hydrate, monitor temperature");
    recs.push("Consider booking a telemedicine visit if symptoms persist");
  } else if (/headache|頭痛|dizzy|めまい/.test(lower)) {
    riskLevel = "moderate";
    specialty = "Neurology / General Practice";
    recs.push("Rest in a quiet environment and monitor symptoms");
  } else {
    recs.push("Monitor symptoms and book a primary care visit");
  }

  const analysis = [
    "AI Medical Consultant analysis (does not replace a physician).",
    `Reported symptoms: ${symptoms}`,
    `Suggested specialty: ${specialty}`,
    `Risk level: ${riskLevel}`,
  ].join("\n");

  return {
    analysis,
    riskLevel,
    specialty,
    recommendations: recs.join(" | "),
    emergency,
    provider: "local-rules",
  };
}

export async function consultSymptoms(symptoms: string): Promise<ConsultResult> {
  if (!config.ai.enabled) {
    return localTriage(symptoms);
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
              "You are a medical triage assistant. Respond in JSON with keys: analysis, riskLevel (low|moderate|high|critical), specialty, recommendations (pipe-separated), emergency (boolean). Never diagnose definitively.",
          },
          { role: "user", content: symptoms },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!res.ok) {
      return localTriage(symptoms);
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content;
    if (!content) return localTriage(symptoms);

    const parsed = JSON.parse(content) as Partial<ConsultResult>;
    return {
      analysis: String(parsed.analysis || localTriage(symptoms).analysis),
      riskLevel: String(parsed.riskLevel || "moderate"),
      specialty: String(parsed.specialty || "General Practice"),
      recommendations: String(parsed.recommendations || "Seek professional care"),
      emergency: Boolean(parsed.emergency),
      provider: "openai",
    };
  } catch {
    return localTriage(symptoms);
  }
}
