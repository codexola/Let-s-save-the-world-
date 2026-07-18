import { prisma } from "./db";
import { notifyUser } from "./notify";
import { audit } from "./auth";

export const LAB_CATEGORIES = [
  "blood",
  "urine",
  "stool",
  "dna",
  "cancer_screening",
  "covid",
  "allergy",
  "hormone",
  "cardiac",
  "prenatal",
] as const;

export const LAB_WORKFLOW = [
  "ordered",
  "sample_collected",
  "analyzing",
  "result_ready",
  "doctor_reviewed",
  "patient_notified",
] as const;

export type LabStatus = (typeof LAB_WORKFLOW)[number];

export async function ensureLabCatalog() {
  const count = await prisma.labTest.count();
  if (count > 0) return;

  let lab = await prisma.laboratoryProfile.findFirst();
  if (!lab) {
    lab = await prisma.laboratoryProfile.create({
      data: {
        name: "MedCare Central Laboratory",
        accreditation: "ISO 15189 / CAP-aligned",
        availableTests: "Full diagnostic menu",
        pricingNotes: "Insurance billing supported; self-pay listed per test",
        turnaroundHoursAvg: 24,
        homeSampleCollection: true,
        operatingHours: "Mon–Sat 08:00–20:00",
        address: "Shinjuku, Tokyo",
        latitude: 35.6938,
        longitude: 139.7034,
        verified: true,
      },
    });
  }

  const tests = [
    { code: "CBC", name: "Complete Blood Count", category: "blood", priceYen: 3200, turnaroundHours: 12, homeCollection: true },
    { code: "BMP", name: "Basic Metabolic Panel", category: "blood", priceYen: 4500, turnaroundHours: 12, homeCollection: true },
    { code: "LIPID", name: "Lipid Panel", category: "blood", priceYen: 3800, turnaroundHours: 24, homeCollection: true },
    { code: "HBA1C", name: "Hemoglobin A1c", category: "blood", priceYen: 4200, turnaroundHours: 24, homeCollection: true },
    { code: "UA", name: "Urinalysis", category: "urine", priceYen: 2500, turnaroundHours: 8, homeCollection: true },
    { code: "UCTX", name: "Urine Culture", category: "urine", priceYen: 5500, turnaroundHours: 48, homeCollection: false },
    { code: "STOOL", name: "Stool Occult Blood", category: "stool", priceYen: 3000, turnaroundHours: 24, homeCollection: true },
    { code: "DNA-SNP", name: "Pharmacogenomics SNP Panel", category: "dna", priceYen: 28000, turnaroundHours: 120, homeCollection: true },
    { code: "PSA", name: "PSA Cancer Screening", category: "cancer_screening", priceYen: 4800, turnaroundHours: 24, homeCollection: true },
    { code: "FIT", name: "FIT Colorectal Screening", category: "cancer_screening", priceYen: 3500, turnaroundHours: 48, homeCollection: true },
    { code: "COVID-PCR", name: "COVID-19 PCR", category: "covid", priceYen: 6500, turnaroundHours: 12, homeCollection: true },
    { code: "COVID-AG", name: "COVID-19 Antigen", category: "covid", priceYen: 2800, turnaroundHours: 2, homeCollection: true },
    { code: "IGE-PANEL", name: "Allergy IgE Panel", category: "allergy", priceYen: 12000, turnaroundHours: 72, homeCollection: true },
    { code: "TSH", name: "Thyroid Stimulating Hormone", category: "hormone", priceYen: 3600, turnaroundHours: 24, homeCollection: true },
    { code: "ESTRADIOL", name: "Estradiol", category: "hormone", priceYen: 5200, turnaroundHours: 48, homeCollection: true },
    { code: "TROPONIN", name: "High-sensitivity Troponin", category: "cardiac", priceYen: 7800, turnaroundHours: 6, homeCollection: false },
    { code: "BNP", name: "BNP / NT-proBNP", category: "cardiac", priceYen: 8200, turnaroundHours: 12, homeCollection: false },
    { code: "NIPT", name: "Non-invasive Prenatal Testing", category: "prenatal", priceYen: 98000, turnaroundHours: 168, homeCollection: true },
    { code: "HCG", name: "β-hCG", category: "prenatal", priceYen: 3200, turnaroundHours: 12, homeCollection: true },
  ];

  await prisma.labTest.createMany({
    data: tests.map((t) => ({
      ...t,
      laboratoryId: lab!.id,
      description: `${t.name} — ${t.category.replace(/_/g, " ")}`,
      active: true,
    })),
  });
}

export async function createLabOrder(opts: {
  patientId: string;
  doctorId?: string;
  testCode: string;
  homeCollection?: boolean;
  collectionAddress?: string;
  laboratoryId?: string;
}) {
  await ensureLabCatalog();
  const test = await prisma.labTest.findFirst({
    where: { code: opts.testCode, active: true },
  });
  if (!test) throw new Error("Test not found in catalog");

  const lab =
    (opts.laboratoryId
      ? await prisma.laboratoryProfile.findUnique({ where: { id: opts.laboratoryId } })
      : null) ||
    (test.laboratoryId
      ? await prisma.laboratoryProfile.findUnique({ where: { id: test.laboratoryId } })
      : null) ||
    (await prisma.laboratoryProfile.findFirst());

  const order = await prisma.laboratoryOrder.create({
    data: {
      patientId: opts.patientId,
      doctorId: opts.doctorId,
      laboratoryId: lab?.id,
      testCode: test.code,
      testType: test.name,
      status: "ordered",
      homeCollection: Boolean(opts.homeCollection ?? test.homeCollection),
      collectionAddress: opts.collectionAddress || null,
      priceYen: test.priceYen,
    },
  });

  await notifyUser({
    userId: opts.patientId,
    subject: "Laboratory order placed",
    body: `Your doctor ordered: ${test.name} (${test.code}). Status: ordered.${
      order.homeCollection ? " Home sample collection available." : ""
    } Est. turnaround ~${test.turnaroundHours}h.`,
    kind: "general",
    channels: ["email", "push"],
  }).catch(() => undefined);

  if (opts.doctorId) await audit(opts.doctorId, "lab.order", "LaboratoryOrder", order.id);
  return order;
}

export async function advanceLabOrder(
  orderId: string,
  nextStatus: LabStatus,
  opts?: { result?: string; doctorNotes?: string; actorId?: string }
) {
  const order = await prisma.laboratoryOrder.findUnique({ where: { id: orderId } });
  if (!order) throw new Error("Order not found");

  const data: Record<string, unknown> = { status: nextStatus };
  if (nextStatus === "sample_collected") data.sampleCollectedAt = new Date();
  if (nextStatus === "analyzing") data.analyzedAt = undefined;
  if (nextStatus === "result_ready") {
    data.analyzedAt = new Date();
    data.result = opts?.result || order.result || "Results pending clinician interpretation.";
  }
  if (nextStatus === "doctor_reviewed") {
    data.doctorReviewedAt = new Date();
    data.doctorNotes = opts?.doctorNotes || order.doctorNotes;
  }
  if (nextStatus === "patient_notified") {
    data.patientNotified = true;
  }

  const updated = await prisma.laboratoryOrder.update({
    where: { id: orderId },
    data,
  });

  if (nextStatus === "result_ready" || nextStatus === "patient_notified") {
    await notifyUser({
      userId: order.patientId,
      subject:
        nextStatus === "patient_notified"
          ? "Lab results available — doctor reviewed"
          : "Lab results ready",
      body: `Test ${order.testType} (${order.testCode}) is now ${nextStatus.replace(/_/g, " ")}.${
        updated.result ? `\n\nResult summary:\n${updated.result}` : ""
      }${updated.doctorNotes ? `\n\nDoctor notes:\n${updated.doctorNotes}` : ""}`,
      kind: "general",
      channels: ["email", "push", "inbox"],
    }).catch(() => undefined);
  }

  if (opts?.actorId) await audit(opts.actorId, `lab.${nextStatus}`, "LaboratoryOrder", orderId);
  return updated;
}
