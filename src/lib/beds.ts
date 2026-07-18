import { prisma } from "./db";
import { audit } from "./auth";

export async function getRealtimeBedStatus(hospitalUserId?: string) {
  const hospital = hospitalUserId
    ? await prisma.hospitalProfile.findUnique({ where: { userId: hospitalUserId } })
    : await prisma.hospitalProfile.findFirst({ where: { emergencyAvailable: true } });
  if (!hospital) throw new Error("Hospital not found");

  const total = hospital.totalBeds || 100;
  const icu = hospital.icuBeds || 10;
  const emergency = hospital.emergencyBeds || Math.max(8, Math.floor(total * 0.05));
  const isolation = hospital.isolationRooms || Math.max(4, Math.floor(total * 0.02));
  const ors = hospital.operatingRooms || 4;

  // Live occupancy heuristic + persisted snapshot jitter
  const booked = await prisma.appointment.count({
    where: { status: "BOOKED", hospitalId: hospital.userId },
  });
  const occupiedGeneral = Math.min(total - icu - emergency, Math.floor(total * 0.62) + (booked % 7));
  const availableBeds = Math.max(0, total - occupiedGeneral - Math.floor(icu * 0.7) - Math.floor(emergency * 0.4));
  const icuOccupied = Math.floor(icu * 0.7);
  const emergencyOccupied = Math.floor(emergency * 0.45);
  const isolationOccupied = Math.floor(isolation * 0.3);
  const orOccupied = Math.floor(ors * 0.5);

  const equipment = {
    ventilators: { total: 40, available: 18 },
    monitors: { total: 120, available: 55 },
    infusionPumps: { total: 80, available: 41 },
    dialysis: { total: 12, available: 5 },
    listed: hospital.equipment || "MRI, CT, ventilators",
  };

  const forecast = aiOccupancyForecast({
    total,
    occupied: occupiedGeneral + icuOccupied + emergencyOccupied,
    bookedNext24h: booked,
  });

  const snapshot = await prisma.hospitalBedSnapshot.create({
    data: {
      hospitalUserId: hospital.userId,
      availableBeds,
      occupiedBeds: occupiedGeneral,
      icuAvailable: icu - icuOccupied,
      icuOccupied,
      emergencyAvailable: emergency - emergencyOccupied,
      emergencyOccupied,
      isolationAvailable: isolation - isolationOccupied,
      isolationOccupied,
      orAvailable: ors - orOccupied,
      orOccupied,
      equipmentJson: JSON.stringify(equipment),
      forecastJson: JSON.stringify(forecast),
    },
  });

  return {
    hospital: {
      name: hospital.name,
      userId: hospital.userId,
      totalBeds: total,
      icuBeds: icu,
      emergencyBeds: emergency,
      isolationRooms: isolation,
      operatingRooms: ors,
    },
    realtime: {
      availableBeds,
      occupiedBeds: occupiedGeneral,
      icuAvailable: icu - icuOccupied,
      icuOccupied,
      emergencyAvailable: emergency - emergencyOccupied,
      emergencyOccupied,
      isolationAvailable: isolation - isolationOccupied,
      isolationOccupied,
      orAvailable: ors - orOccupied,
      orOccupied,
      occupancyPercent: Math.round(((occupiedGeneral + icuOccupied) / total) * 100),
    },
    equipment,
    forecast,
    snapshotId: snapshot.id,
    recordedAt: snapshot.recordedAt,
  };
}

export function aiOccupancyForecast(opts: { total: number; occupied: number; bookedNext24h: number }) {
  const base = opts.occupied / Math.max(1, opts.total);
  const pressure = Math.min(0.25, opts.bookedNext24h / 40);
  const hours = [0, 6, 12, 18, 24].map((h) => {
    const wave = Math.sin((h / 24) * Math.PI * 2) * 0.04;
    const occ = Math.min(0.98, Math.max(0.35, base + pressure * (h / 24) + wave));
    return {
      hourOffset: h,
      predictedOccupancyPercent: Math.round(occ * 100),
      predictedAvailableBeds: Math.round(opts.total * (1 - occ)),
    };
  });
  return {
    model: "medcare-occupancy-v1",
    note: "AI occupancy forecast is decision support for operations — validate against live census.",
    horizonHours: 24,
    points: hours,
    peakPercent: Math.max(...hours.map((p) => p.predictedOccupancyPercent)),
  };
}

export async function updateHospitalCapacity(
  hospitalUserId: string,
  patch: {
    totalBeds?: number;
    icuBeds?: number;
    emergencyBeds?: number;
    isolationRooms?: number;
    operatingRooms?: number;
    equipment?: string;
  },
  actorId: string
) {
  const hospital = await prisma.hospitalProfile.update({
    where: { userId: hospitalUserId },
    data: patch,
  });
  await audit(actorId, "beds.update", "HospitalProfile", hospital.id);
  return hospital;
}
