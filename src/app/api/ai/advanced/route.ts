import { NextRequest, NextResponse } from "next/server";
import { requireSession, audit } from "@/lib/auth";
import {
  checkPatientMedicationInteractions,
  forecastOccupancy,
  optimizeAppointmentSchedule,
  predictNoShows,
  summarizeMedicalDocument,
  translateClinicalText,
} from "@/lib/ai-advanced";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    const session = await requireSession();
    const action = req.nextUrl.searchParams.get("action");

    if (action === "noshow") {
      const predictions = await predictNoShows({
        doctorId: session.role === "DOCTOR" ? session.id : req.nextUrl.searchParams.get("doctorId") || undefined,
      });
      return NextResponse.json({ predictions, disclaimer: "Predictive scores are probabilistic — not clinical advice." });
    }

    if (action === "interactions") {
      const result = await checkPatientMedicationInteractions(session.id);
      return NextResponse.json(result);
    }

    if (action === "ops_forecast") {
      const days = [];
      for (let i = 13; i >= 0; i--) {
        const d = new Date();
        d.setHours(0, 0, 0, 0);
        d.setDate(d.getDate() - i);
        const next = new Date(d);
        next.setDate(next.getDate() + 1);
        const count = await prisma.appointment.count({
          where: {
            scheduledAt: { gte: d, lt: next },
            status: { in: ["BOOKED", "COMPLETED", "RESCHEDULED"] },
          },
        });
        days.push(count);
      }
      const occupancyProxy = days.map((c) => Math.min(100, c * 8));
      return NextResponse.json({
        historyOccupancyProxy: occupancyProxy,
        forecastNext4Days: forecastOccupancy(occupancyProxy, 4),
        note: "Heuristic moving-average forecast from appointment volume.",
      });
    }

    return NextResponse.json({
      features: [
        "summarize",
        "translate",
        "interactions",
        "optimize",
        "noshow",
        "ops_forecast",
        "triage (via /api/ai/consult)",
        "recommend (via /api/recommend)",
      ],
    });
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

    if (body.action === "summarize") {
      const result = await summarizeMedicalDocument(String(body.text || ""), String(body.locale || "en"));
      await audit(session.id, "ai.summarize", "Document", String((body.text || "").length));
      return NextResponse.json(result);
    }

    if (body.action === "translate") {
      const result = await translateClinicalText(
        String(body.text || ""),
        String(body.targetLocale || "en"),
        String(body.sourceLocale || "auto")
      );
      await audit(session.id, "ai.translate", "Document", result.targetLocale);
      return NextResponse.json(result);
    }

    if (body.action === "interactions") {
      const additional = Array.isArray(body.medications)
        ? body.medications.map(String)
        : body.medication
          ? [String(body.medication)]
          : [];
      const result = await checkPatientMedicationInteractions(session.id, additional);
      return NextResponse.json(result);
    }

    if (body.action === "optimize") {
      const doctorId = String(body.doctorId || (session.role === "DOCTOR" ? session.id : ""));
      if (!doctorId) return NextResponse.json({ error: "doctorId required" }, { status: 400 });
      const day = body.date ? new Date(body.date) : new Date();
      const result = await optimizeAppointmentSchedule({ doctorId, day });
      await audit(session.id, "ai.optimize", "Appointment", doctorId);
      return NextResponse.json(result);
    }

    if (body.action === "mark_no_show") {
      if (!["DOCTOR", "HOSPITAL", "ADMIN", "DEVELOPER"].includes(session.role)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      const appt = await prisma.appointment.update({
        where: { id: String(body.appointmentId) },
        data: { status: "NO_SHOW" },
      });
      await audit(session.id, "appointment.no_show", "Appointment", appt.id);
      return NextResponse.json({ appointment: appt });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error";
    const status = message === "UNAUTHORIZED" ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
