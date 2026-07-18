import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

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

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const symptoms = String(body.symptoms || "").trim();
  if (!symptoms) return NextResponse.json({ error: "Symptoms required" }, { status: 400 });

  const lower = symptoms.toLowerCase();
  const emergency = EMERGENCY_KEYWORDS.some((k) => lower.includes(k.toLowerCase()));

  let riskLevel = "low";
  let specialty = "General Practice";
  const recommendations: string[] = [];

  if (emergency) {
    riskLevel = "critical";
    specialty = "Emergency Medicine";
    recommendations.push("Call emergency services immediately (119 in Japan)");
  } else if (/fever|熱|cough|咳|sore throat/.test(lower)) {
    riskLevel = "moderate";
    specialty = "Internal Medicine / ENT";
    recommendations.push("Rest, hydrate, monitor temperature");
  } else {
    recommendations.push("Monitor symptoms and book a primary care visit");
  }

  const analysis = [
    "AI Medical Consultant analysis (does not replace a physician).",
    `Reported symptoms: ${symptoms}`,
    `Suggested specialty: ${specialty}`,
    `Risk level: ${riskLevel}`,
  ].join("\n");

  const record = await prisma.aiConsultation.create({
    data: {
      userId: session.id,
      symptoms,
      analysis,
      riskLevel,
      specialty,
      recommendations: recommendations.join(" | "),
      emergency,
    },
  });

  return NextResponse.json({
    consultation: record,
    disclaimer: "This AI triage does not replace professional medical judgment.",
  });
}

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const history = await prisma.aiConsultation.findMany({
    where: { userId: session.id },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return NextResponse.json({ history });
}
