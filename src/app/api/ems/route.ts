import { NextRequest, NextResponse } from "next/server";
import { getSession, requireSession, audit } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  createEmergencyDispatch,
  ensureDigitalEmergencyId,
  tickAmbulanceGps,
  buildEmergencyHistoryShare,
} from "@/lib/ems";

export async function GET(req: NextRequest) {
  const session = await getSession();
  const sp = req.nextUrl.searchParams;
  const action = sp.get("action");
  const code = sp.get("code");
  const token = sp.get("token");

  // Public digital emergency ID lookup for responders
  if (action === "digital_id" && (code || token)) {
    const eid = await prisma.digitalEmergencyId.findFirst({
      where: code
        ? { publicCode: code.toUpperCase(), active: true }
        : { shareToken: String(token), active: true },
      include: { user: { select: { name: true } } },
    });
    if (!eid) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({
      digitalId: {
        publicCode: eid.publicCode,
        patientName: eid.user.name,
        bloodType: eid.bloodType,
        allergies: eid.allergies,
        medications: eid.medications,
        medicalHistory: eid.medicalHistory,
        emergencyContacts: eid.emergencyContacts,
        insuranceInfo: eid.insuranceInfo,
      },
    });
  }

  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (action === "my_digital_id") {
    const eid = await ensureDigitalEmergencyId(session.id);
    return NextResponse.json({ digitalId: eid });
  }

  if (action === "ambulances") {
    const ambulances = await prisma.ambulanceUnit.findMany({ orderBy: { callSign: "asc" } });
    return NextResponse.json({ ambulances });
  }

  if (action === "beds") {
    const hospitals = await prisma.hospitalProfile.findMany({
      where: { emergencyAvailable: true },
      select: {
        name: true,
        totalBeds: true,
        icuBeds: true,
        userId: true,
        ambulance: true,
      },
    });
    return NextResponse.json({ hospitals });
  }

  if (action === "track" && sp.get("id")) {
    const updated = await tickAmbulanceGps(String(sp.get("id")));
    return NextResponse.json({ request: updated });
  }

  const id = sp.get("id");
  if (id) {
    const request = await prisma.emergencyRequest.findUnique({
      where: { id },
      include: { ambulance: true, patient: { select: { id: true, name: true, email: true } } },
    });
    if (!request) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({
      request,
      sharedHistory: request.sharedHistoryJson ? JSON.parse(request.sharedHistoryJson) : null,
    });
  }

  const isCrew =
    session.role === "HOSPITAL" ||
    session.role === "ADMIN" ||
    session.role === "DEVELOPER" ||
    session.role === "DOCTOR" ||
    session.role === "NURSE";

  const requests = await prisma.emergencyRequest.findMany({
    where: isCrew ? undefined : { patientId: session.id },
    include: {
      ambulance: true,
      patient: { select: { id: true, name: true, email: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return NextResponse.json({ requests });
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    const body = await req.json();
    const action = body.action || "request";

    if (action === "request" || action === "one_touch") {
      const lat = body.latitude != null ? Number(body.latitude) : undefined;
      const lng = body.longitude != null ? Number(body.longitude) : undefined;
      const result = await createEmergencyDispatch({
        patientId: session?.id || body.patientId,
        symptoms: String(body.symptoms || "One-touch emergency request"),
        location: body.location ? String(body.location) : undefined,
        latitude: Number.isFinite(lat) ? lat : undefined,
        longitude: Number.isFinite(lng) ? lng : undefined,
        runAi: body.runAi !== false,
      });
      if (session) await audit(session.id, "ems.request", "EmergencyRequest", result.request?.id);
      return NextResponse.json({
        ok: true,
        ...result,
        message:
          "Emergency services notified. Share your Digital Emergency ID with responders. AI assessment is triage-only and does not replace a physician.",
      });
    }

    if (action === "ensure_digital_id") {
      const s = await requireSession();
      const eid = await ensureDigitalEmergencyId(s.id);
      return NextResponse.json({ digitalId: eid });
    }

    if (action === "update_vitals") {
      const s = await requireSession();
      if (!["HOSPITAL", "ADMIN", "DEVELOPER", "DOCTOR", "NURSE"].includes(s.role)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      const request = await prisma.emergencyRequest.update({
        where: { id: String(body.id) },
        data: {
          vitalsJson: JSON.stringify(body.vitals || {}),
          treatmentNotes: body.treatmentNotes != null ? String(body.treatmentNotes) : undefined,
          status: body.status ? String(body.status) : undefined,
        },
        include: { ambulance: true },
      });
      return NextResponse.json({ request });
    }

    if (action === "tick_gps") {
      const updated = await tickAmbulanceGps(String(body.id));
      return NextResponse.json({ request: updated });
    }

    if (action === "arrive_hospital") {
      const s = await requireSession();
      const request = await prisma.emergencyRequest.update({
        where: { id: String(body.id) },
        data: { status: "arrived", etaMinutes: 0 },
        include: { ambulance: true },
      });
      if (request.ambulanceId) {
        await prisma.ambulanceUnit.update({
          where: { id: request.ambulanceId },
          data: { status: "available" },
        });
      }
      await audit(s.id, "ems.arrive", "EmergencyRequest", request.id);
      return NextResponse.json({ request });
    }

    if (action === "sync_beds") {
      const hospitals = await prisma.hospitalProfile.findMany({
        where: { emergencyAvailable: true },
        select: { name: true, totalBeds: true, icuBeds: true, userId: true },
      });
      return NextResponse.json({
        hospitals,
        syncedAt: new Date().toISOString(),
        note: "Bed availability synchronized from hospital profiles",
      });
    }

    if (action === "refresh_history_share") {
      const s = await requireSession();
      const share = await buildEmergencyHistoryShare(s.id);
      await ensureDigitalEmergencyId(s.id);
      return NextResponse.json({ sharedHistory: share });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error";
    const status = message === "UNAUTHORIZED" ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
