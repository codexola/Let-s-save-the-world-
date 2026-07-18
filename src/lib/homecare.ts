import { prisma } from "./db";
import { notifyUser } from "./notify";
import { audit } from "./auth";

export const HOME_CARE_SERVICES = [
  { type: "doctor_home_visit", label: "Doctor Home Visits", priceYen: 15000 },
  { type: "nurse_visit", label: "Nurse Visits", priceYen: 8000 },
  { type: "physical_therapy", label: "Physical Therapy", priceYen: 9000 },
  { type: "occupational_therapy", label: "Occupational Therapy", priceYen: 9000 },
  { type: "speech_therapy", label: "Speech Therapy", priceYen: 8500 },
  { type: "home_blood_collection", label: "Home Blood Collection", priceYen: 4500 },
  { type: "medication_delivery", label: "Medication Delivery", priceYen: 1500 },
  { type: "medical_equipment_rental", label: "Medical Equipment Rental", priceYen: 5000 },
  { type: "elder_care", label: "Elder Care", priceYen: 12000 },
  { type: "rehabilitation", label: "Rehabilitation", priceYen: 10000 },
] as const;

export async function ensureHomeCareSeed(patientId: string, providerId?: string) {
  const count = await prisma.homeCareOrder.count({ where: { patientId } });
  if (count > 0) return;
  const samples = [
    HOME_CARE_SERVICES[0],
    HOME_CARE_SERVICES[1],
    HOME_CARE_SERVICES[5],
    HOME_CARE_SERVICES[6],
    HOME_CARE_SERVICES[7],
  ];
  for (const s of samples) {
    await prisma.homeCareOrder.create({
      data: {
        patientId,
        providerId,
        serviceType: s.type,
        title: s.label,
        description: `Scheduled ${s.label.toLowerCase()} at home`,
        address: "Setagaya, Tokyo",
        scheduledAt: new Date(Date.now() + (2 + Math.floor(Math.random() * 10)) * 86400_000),
        status: "scheduled",
        priceYen: s.priceYen,
        equipmentItem: s.type === "medical_equipment_rental" ? "Hospital bed + SpO2 monitor" : null,
      },
    });
  }
}

export async function requestHomeCare(opts: {
  patientId: string;
  serviceType: string;
  address?: string;
  scheduledAt?: string;
  notes?: string;
  equipmentItem?: string;
}) {
  const svc = HOME_CARE_SERVICES.find((s) => s.type === opts.serviceType);
  if (!svc) throw new Error("Unsupported home care service");
  let providerId: string | undefined;
  if (opts.serviceType === "doctor_home_visit") {
    providerId = (await prisma.user.findFirst({ where: { role: "DOCTOR" } }))?.id;
  } else if (opts.serviceType === "nurse_visit" || opts.serviceType === "home_blood_collection") {
    providerId = (await prisma.user.findFirst({ where: { role: "NURSE" } }))?.id;
  } else {
    providerId = (await prisma.user.findFirst({ where: { role: { in: ["NURSE", "DOCTOR"] } } }))?.id;
  }
  const order = await prisma.homeCareOrder.create({
    data: {
      patientId: opts.patientId,
      providerId,
      serviceType: opts.serviceType,
      title: svc.label,
      description: opts.notes || svc.label,
      address: opts.address || "Patient home address on file",
      scheduledAt: opts.scheduledAt ? new Date(opts.scheduledAt) : new Date(Date.now() + 2 * 86400_000),
      status: "requested",
      priceYen: svc.priceYen,
      equipmentItem: opts.equipmentItem || (opts.serviceType === "medical_equipment_rental" ? "Wheelchair" : null),
      notes: opts.notes,
    },
  });
  await notifyUser({
    userId: opts.patientId,
    subject: `Home care requested: ${svc.label}`,
    body: `Your ${svc.label} request is logged. Estimated ¥${svc.priceYen.toLocaleString()}.`,
    kind: "appointment",
    channels: ["email", "push"],
  }).catch(() => undefined);
  await audit(opts.patientId, "homecare.request", "HomeCareOrder", order.id);
  return order;
}
