import { NextRequest, NextResponse } from "next/server";
import { getSession, requireSession, audit } from "@/lib/auth";
import { consultSymptoms } from "@/lib/ai";
import { prisma } from "@/lib/db";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const symptoms = String(body.symptoms || "").trim();
  if (!symptoms) return NextResponse.json({ error: "Symptoms required" }, { status: 400 });

  const latitude = body.latitude != null ? Number(body.latitude) : undefined;
  const longitude = body.longitude != null ? Number(body.longitude) : undefined;

  const result = await consultSymptoms(symptoms, { latitude, longitude });

  const followUpAt = new Date(Date.now() + result.followUpHours * 60 * 60 * 1000);

  const record = await prisma.aiConsultation.create({
    data: {
      userId: session.id,
      symptoms,
      analysis: result.analysis,
      riskLevel: result.riskLevel,
      specialty: result.specialty,
      recommendations: result.recommendations,
      emergency: result.emergency,
      diseasePredictions: JSON.stringify(result.diseasePredictions),
      medications: JSON.stringify(result.medications),
      lifestyleAdvice: result.lifestyleAdvice,
      nutritionAdvice: result.nutritionAdvice,
      mentalHealthAdvice: result.mentalHealthAdvice,
      recommendedHospitals: JSON.stringify(result.recommendedHospitals),
      recommendedDoctors: JSON.stringify(result.recommendedDoctors),
      recommendedNurses: JSON.stringify(result.recommendedNurses),
      nearbyProviders: JSON.stringify(result.nearbyProviders),
      appointmentSuggestion: JSON.stringify(result.appointmentSuggestion),
      resultJson: JSON.stringify(result),
      followUpAt,
    },
  });

  const reminder = await prisma.followUpReminder.create({
    data: {
      userId: session.id,
      consultationId: record.id,
      title: `Follow-up: ${result.specialty}`,
      body: `Check on symptoms ("${symptoms.slice(0, 80)}") — risk was ${result.riskLevel}. ${result.appointmentSuggestion.note}`,
      dueAt: followUpAt,
    },
  });

  await prisma.notification.create({
    data: {
      userId: session.id,
      email: session.email,
      subject: `AI follow-up scheduled`,
      body: `A follow-up reminder is set for ${followUpAt.toISOString()}. ${result.recommendations}`,
    },
  });

  if (result.emergency) {
    await prisma.emergencyRequest.create({
      data: {
        patientId: session.id,
        symptoms,
        location:
          latitude != null && longitude != null
            ? `${latitude},${longitude}`
            : body.location || null,
        status: "requested",
        etaMinutes: 8 + Math.floor(Math.random() * 12),
        hospitalNotified: true,
      },
    });
    await prisma.notification.create({
      data: {
        userId: session.id,
        email: session.email,
        channel: "emergency",
        subject: "Emergency detected",
        body: "AI triage flagged an emergency. Call 119 immediately. An EMS request was logged.",
      },
    });
  }

  await audit(session.id, "ai.consult", "AiConsultation", record.id);

  return NextResponse.json({
    consultation: record,
    enrichment: {
      diseasePredictions: result.diseasePredictions,
      medications: result.medications,
      lifestyleAdvice: result.lifestyleAdvice,
      nutritionAdvice: result.nutritionAdvice,
      mentalHealthAdvice: result.mentalHealthAdvice,
      recommendedHospitals: result.recommendedHospitals,
      recommendedDoctors: result.recommendedDoctors,
      recommendedNurses: result.recommendedNurses,
      nearbyProviders: result.nearbyProviders,
      appointmentSuggestion: result.appointmentSuggestion,
      followUpAt,
      reminderId: reminder.id,
    },
    provider: result.provider,
    disclaimer: "This AI triage does not replace professional medical judgment.",
  });
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  if (url.searchParams.get("reminders") === "1") {
    const reminders = await prisma.followUpReminder.findMany({
      where: { userId: session.id },
      orderBy: { dueAt: "asc" },
      take: 50,
    });
    return NextResponse.json({ reminders });
  }

  const history = await prisma.aiConsultation.findMany({
    where: { userId: session.id },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return NextResponse.json({ history });
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await requireSession();
    const body = await req.json();
    if (body.action === "complete_reminder") {
      await prisma.followUpReminder.updateMany({
        where: { id: body.reminderId, userId: session.id },
        data: { completed: true },
      });
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
