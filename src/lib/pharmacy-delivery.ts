import { randomBytes } from "crypto";
import { prisma } from "./db";
import { notifyUser } from "./notify";
import { audit } from "./auth";

export async function createPharmacyDelivery(opts: {
  patientId: string;
  medicineName: string;
  address?: string;
  sameDay?: boolean;
  coldChain?: boolean;
  prescriptionId?: string;
  prescriptionImage?: string;
  pharmacyId?: string;
}) {
  const pharmacy =
    (opts.pharmacyId
      ? await prisma.pharmacyProfile.findUnique({ where: { id: opts.pharmacyId } })
      : null) || (await prisma.pharmacyProfile.findFirst());

  // Inventory sync: decrement matching medicine stock if found
  if (pharmacy) {
    const med = await prisma.medicine.findFirst({
      where: {
        pharmacyId: pharmacy.id,
        name: { contains: opts.medicineName.split(" ")[0] },
      },
    });
    if (med && med.stock > 0) {
      await prisma.medicine.update({
        where: { id: med.id },
        data: { stock: Math.max(0, med.stock - 1) },
      });
    }
  }

  const trackingCode = `PD-${randomBytes(4).toString("hex").toUpperCase()}`;
  const delivery = await prisma.pharmacyDelivery.create({
    data: {
      patientId: opts.patientId,
      pharmacyId: pharmacy?.id,
      prescriptionId: opts.prescriptionId,
      medicineName: opts.medicineName,
      status: "dispatched",
      sameDay: opts.sameDay !== false,
      homeDelivery: true,
      address: opts.address || "Patient home on file",
      prescriptionImage: opts.prescriptionImage,
      courierLat: 35.6895,
      courierLng: 139.6917,
      etaMinutes: opts.sameDay === false ? 48 * 60 : 90 + Math.floor(Math.random() * 40),
      coldChain: Boolean(opts.coldChain),
      coldTempC: opts.coldChain ? 4.2 : null,
      coldAlert: false,
      trackingCode,
    },
  });

  await notifyUser({
    userId: opts.patientId,
    subject: `Pharmacy delivery ${trackingCode}`,
    body: `${opts.medicineName} ${opts.sameDay !== false ? "same-day" : "standard"} home delivery en route. ETA ~${delivery.etaMinutes} min.`,
    kind: "prescription",
    channels: ["email", "push"],
  }).catch(() => undefined);

  await audit(opts.patientId, "pharmacy.delivery", "PharmacyDelivery", delivery.id);
  return delivery;
}

export async function tickDeliveryTracking(id: string) {
  const d = await prisma.pharmacyDelivery.findUnique({ where: { id } });
  if (!d || ["delivered", "cancelled"].includes(d.status)) return d;
  const targetLat = 35.6812;
  const targetLng = 139.7671;
  const curLat = d.courierLat ?? 35.7;
  const curLng = d.courierLng ?? 139.7;
  const nextLat = curLat + (targetLat - curLat) * 0.3;
  const nextLng = curLng + (targetLng - curLng) * 0.3;
  const eta = Math.max(5, Math.round((d.etaMinutes || 60) * 0.7));
  let coldTempC = d.coldTempC;
  let coldAlert = false;
  if (d.coldChain) {
    coldTempC = Number(((coldTempC ?? 4) + (Math.random() * 0.6 - 0.2)).toFixed(1));
    coldAlert = coldTempC > 8 || coldTempC < 2;
  }
  return prisma.pharmacyDelivery.update({
    where: { id },
    data: {
      courierLat: nextLat,
      courierLng: nextLng,
      etaMinutes: eta,
      status: eta <= 8 ? "arriving" : "in_transit",
      coldTempC,
      coldAlert,
    },
  });
}

export async function markDelivered(id: string) {
  return prisma.pharmacyDelivery.update({
    where: { id },
    data: { status: "delivered", etaMinutes: 0 },
  });
}

export async function setupAutoRefill(opts: {
  patientId: string;
  medication: string;
  intervalDays?: number;
}) {
  const intervalDays = opts.intervalDays || 30;
  return prisma.pharmacyRefill.create({
    data: {
      patientId: opts.patientId,
      medication: opts.medication,
      intervalDays,
      nextRefillAt: new Date(Date.now() + intervalDays * 86400_000),
      active: true,
    },
  });
}

export async function processDueRefills(patientId?: string) {
  const due = await prisma.pharmacyRefill.findMany({
    where: {
      active: true,
      nextRefillAt: { lte: new Date() },
      ...(patientId ? { patientId } : {}),
    },
    take: 50,
  });
  const created = [];
  for (const r of due) {
    const delivery = await createPharmacyDelivery({
      patientId: r.patientId,
      medicineName: r.medication,
      sameDay: true,
      coldChain: /insulin|vaccine|biologic/i.test(r.medication),
    });
    await prisma.pharmacyRefill.update({
      where: { id: r.id },
      data: {
        lastOrderedAt: new Date(),
        nextRefillAt: new Date(Date.now() + r.intervalDays * 86400_000),
      },
    });
    created.push(delivery);
  }
  return created;
}

export async function syncPharmacyInventory(pharmacyUserId?: string) {
  const profile = pharmacyUserId
    ? await prisma.pharmacyProfile.findUnique({ where: { userId: pharmacyUserId } })
    : await prisma.pharmacyProfile.findFirst();
  if (!profile) throw new Error("Pharmacy not found");
  const medicines = await prisma.medicine.findMany({ where: { pharmacyId: profile.id } });
  // Simulated external sync: bump low stock
  let updated = 0;
  for (const m of medicines) {
    if (m.stock < 10) {
      await prisma.medicine.update({
        where: { id: m.id },
        data: { stock: m.stock + 50 },
      });
      updated += 1;
    }
  }
  return { pharmacyId: profile.id, medicines: medicines.length, restocked: updated, syncedAt: new Date().toISOString() };
}
