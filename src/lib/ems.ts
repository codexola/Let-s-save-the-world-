import { randomBytes } from "crypto";
import { prisma } from "./db";
import { notifyUser } from "./notify";
import { consultSymptoms } from "./ai";

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

export async function buildEmergencyHistoryShare(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { patientProfile: true, ehr: true, familyMembers: true },
  });
  if (!user) return null;
  return {
    name: user.name,
    bloodType: user.patientProfile?.bloodType || null,
    allergies: user.patientProfile?.allergies || null,
    medications: user.patientProfile?.medications || null,
    medicalHistory: user.patientProfile?.medicalHistory || user.ehr?.diagnoses || null,
    insuranceInfo: user.patientProfile?.insuranceInfo || null,
    emergencyContacts: user.patientProfile?.emergencyContact ||
      user.familyMembers.map((f) => `${f.name} (${f.relationship})`).join("; ") ||
      null,
    ehrSummary: user.ehr
      ? {
          diagnoses: user.ehr.diagnoses,
          treatments: user.ehr.treatments,
          vaccinations: user.ehr.vaccinations,
        }
      : null,
  };
}

export async function ensureDigitalEmergencyId(userId: string) {
  const existing = await prisma.digitalEmergencyId.findUnique({ where: { userId } });
  if (existing) {
    const share = await buildEmergencyHistoryShare(userId);
    return prisma.digitalEmergencyId.update({
      where: { userId },
      data: {
        bloodType: share?.bloodType,
        allergies: share?.allergies,
        medications: share?.medications,
        medicalHistory: share?.medicalHistory,
        emergencyContacts: share?.emergencyContacts,
        insuranceInfo: share?.insuranceInfo,
      },
    });
  }
  const share = await buildEmergencyHistoryShare(userId);
  const publicCode = `EID-${randomBytes(3).toString("hex").toUpperCase()}`;
  const shareToken = randomBytes(16).toString("hex");
  return prisma.digitalEmergencyId.create({
    data: {
      userId,
      publicCode,
      shareToken,
      bloodType: share?.bloodType,
      allergies: share?.allergies,
      medications: share?.medications,
      medicalHistory: share?.medicalHistory,
      emergencyContacts: share?.emergencyContacts,
      insuranceInfo: share?.insuranceInfo,
    },
  });
}

export async function findNearestAmbulance(lat?: number | null, lng?: number | null) {
  const units = await prisma.ambulanceUnit.findMany({
    where: { status: { in: ["available", "returning"] } },
  });
  if (!units.length) {
    const created = await prisma.ambulanceUnit.create({
      data: {
        callSign: `AMB-${String(Math.floor(Math.random() * 900) + 100)}`,
        status: "available",
        latitude: 35.6812,
        longitude: 139.7671,
        hospitalBase: "Tokyo Central Hospital",
      },
    });
    return { unit: created, distanceKm: lat != null && lng != null ? haversineKm(lat, lng, 35.6812, 139.7671) : null };
  }
  if (lat == null || lng == null) {
    return { unit: units[0], distanceKm: null };
  }
  let best = units[0];
  let bestD = Infinity;
  for (const u of units) {
    if (u.latitude == null || u.longitude == null) continue;
    const d = haversineKm(lat, lng, u.latitude, u.longitude);
    if (d < bestD) {
      bestD = d;
      best = u;
    }
  }
  return { unit: best, distanceKm: Number.isFinite(bestD) ? Math.round(bestD * 10) / 10 : null };
}

export async function findNearestEmergencyHospital(lat?: number | null, lng?: number | null) {
  const hospitals = await prisma.hospitalProfile.findMany({
    where: { OR: [{ emergencyAvailable: true }, { ambulance: true }] },
    include: { user: { select: { id: true, name: true, email: true } } },
    take: 20,
  });
  if (!hospitals.length) return null;
  if (lat == null || lng == null) return hospitals[0];
  let best = hospitals[0];
  let bestD = Infinity;
  for (const h of hospitals) {
    if (h.latitude == null || h.longitude == null) continue;
    const d = haversineKm(lat, lng, h.latitude, h.longitude);
    if (d < bestD) {
      bestD = d;
      best = h;
    }
  }
  return best;
}

export async function createEmergencyDispatch(opts: {
  patientId?: string;
  symptoms: string;
  location?: string;
  latitude?: number;
  longitude?: number;
  runAi?: boolean;
}) {
  let aiAssessment: string | null = null;
  let riskLevel: string | null = null;
  if (opts.runAi !== false) {
    try {
      const triage = await consultSymptoms(opts.symptoms, {
        latitude: opts.latitude,
        longitude: opts.longitude,
      });
      aiAssessment = triage.analysis;
      riskLevel = triage.riskLevel;
    } catch {
      aiAssessment = "Local triage unavailable — treat as high urgency until assessed.";
      riskLevel = "high";
    }
  }

  const { unit, distanceKm } = await findNearestAmbulance(opts.latitude, opts.longitude);
  const hospital = await findNearestEmergencyHospital(opts.latitude, opts.longitude);
  const speedKmh = 40;
  const etaMinutes =
    distanceKm != null
      ? Math.max(6, Math.round((distanceKm / speedKmh) * 60) + 3)
      : 8 + Math.floor(Math.random() * 12);

  const ambLat = opts.latitude != null ? opts.latitude + 0.01 : unit.latitude;
  const ambLng = opts.longitude != null ? opts.longitude - 0.008 : unit.longitude;

  let emergencyIdCode: string | null = null;
  let sharedHistoryJson: string | null = null;
  if (opts.patientId) {
    const eid = await ensureDigitalEmergencyId(opts.patientId);
    emergencyIdCode = eid.publicCode;
    const share = await buildEmergencyHistoryShare(opts.patientId);
    sharedHistoryJson = JSON.stringify(share);
  }

  await prisma.ambulanceUnit.update({
    where: { id: unit.id },
    data: { status: "en_route", latitude: ambLat, longitude: ambLng },
  });

  const request = await prisma.emergencyRequest.create({
    data: {
      patientId: opts.patientId,
      symptoms: opts.symptoms,
      location: opts.location,
      latitude: opts.latitude,
      longitude: opts.longitude,
      status: "dispatched",
      aiAssessment,
      riskLevel,
      etaMinutes,
      ambulanceId: unit.id,
      ambulanceLat: ambLat,
      ambulanceLng: ambLng,
      destinationHospitalId: hospital?.userId || null,
      destinationName: hospital?.name || hospital?.user?.name || "Nearest ER",
      hospitalNotified: true,
      familyNotified: false,
      arrivalPredictedAt: new Date(Date.now() + etaMinutes * 60_000),
      emergencyIdCode,
      sharedHistoryJson,
      vitalsJson: JSON.stringify({ hr: null, spo2: null, bp: null, rr: null }),
    },
    include: { ambulance: true },
  });

  // Hospital pre-notification
  if (hospital?.user?.email) {
    await notifyUser({
      userId: hospital.userId,
      subject: "EMS pre-notification — inbound ambulance",
      body: `Patient inbound. Symptoms: ${opts.symptoms}. ETA ~${etaMinutes} min. Digital ID: ${emergencyIdCode || "n/a"}. Risk: ${riskLevel || "unknown"}.`,
      kind: "emergency",
      emergency: true,
      channels: ["email", "push", "inbox"],
    }).catch(() => undefined);
  }

  // Family / emergency contact notification
  if (opts.patientId) {
    const profile = await prisma.patientProfile.findUnique({ where: { userId: opts.patientId } });
    const patient = await prisma.user.findUnique({ where: { id: opts.patientId } });
    if (patient) {
      await notifyUser({
        userId: opts.patientId,
        subject: "EMS dispatched",
        body: `Ambulance ${unit.callSign} en route. ETA ~${etaMinutes} min to ${request.destinationName}. Digital Emergency ID: ${emergencyIdCode}.`,
        kind: "emergency",
        emergency: true,
      }).catch(() => undefined);
    }
    if (profile?.emergencyContact) {
      // Store family notify as inbox on patient + mark flag (email string may not be a user)
      await prisma.notification.create({
        data: {
          userId: opts.patientId,
          email: patient?.email || "family@medcare.local",
          channel: "emergency",
          kind: "emergency",
          subject: "Family notification logged",
          body: `Attempted family/emergency contact notify: ${profile.emergencyContact}. Message: EMS dispatched for ${patient?.name}. ETA ${etaMinutes} min.`,
        },
      });
      await prisma.emergencyRequest.update({
        where: { id: request.id },
        data: { familyNotified: true },
      });
    }
  }

  return {
    request: await prisma.emergencyRequest.findUnique({
      where: { id: request.id },
      include: { ambulance: true },
    }),
    ambulance: unit,
    distanceKm,
    hospital: hospital
      ? { id: hospital.userId, name: hospital.name, beds: hospital.totalBeds, icu: hospital.icuBeds }
      : null,
  };
}

export async function tickAmbulanceGps(requestId: string) {
  const req = await prisma.emergencyRequest.findUnique({
    where: { id: requestId },
    include: { ambulance: true },
  });
  if (!req || !req.ambulance) return null;
  if (!["dispatched", "en_route", "on_scene"].includes(req.status)) return req;

  const targetLat = req.latitude ?? 35.6812;
  const targetLng = req.longitude ?? 139.7671;
  const curLat = req.ambulanceLat ?? req.ambulance.latitude ?? targetLat + 0.02;
  const curLng = req.ambulanceLng ?? req.ambulance.longitude ?? targetLng - 0.02;
  const nextLat = curLat + (targetLat - curLat) * 0.25;
  const nextLng = curLng + (targetLng - curLng) * 0.25;
  const dist = haversineKm(nextLat, nextLng, targetLat, targetLng);
  const etaMinutes = Math.max(1, Math.round((dist / 40) * 60));

  await prisma.ambulanceUnit.update({
    where: { id: req.ambulance.id },
    data: { latitude: nextLat, longitude: nextLng, status: dist < 0.3 ? "on_scene" : "en_route" },
  });

  return prisma.emergencyRequest.update({
    where: { id: requestId },
    data: {
      ambulanceLat: nextLat,
      ambulanceLng: nextLng,
      etaMinutes,
      status: dist < 0.3 ? "on_scene" : "en_route",
      arrivalPredictedAt: new Date(Date.now() + etaMinutes * 60_000),
    },
    include: { ambulance: true },
  });
}
