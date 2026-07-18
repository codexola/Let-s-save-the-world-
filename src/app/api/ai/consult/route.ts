import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { consultSymptoms } from "@/lib/ai";
import { prisma } from "@/lib/db";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const symptoms = String(body.symptoms || "").trim();
  if (!symptoms) return NextResponse.json({ error: "Symptoms required" }, { status: 400 });

  const result = await consultSymptoms(symptoms);

  const record = await prisma.aiConsultation.create({
    data: {
      userId: session.id,
      symptoms,
      analysis: result.analysis,
      riskLevel: result.riskLevel,
      specialty: result.specialty,
      recommendations: result.recommendations,
      emergency: result.emergency,
    },
  });

  return NextResponse.json({
    consultation: record,
    provider: result.provider,
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
