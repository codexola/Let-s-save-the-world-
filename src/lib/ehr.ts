import { prisma } from "./db";

export const EHR_SECTIONS = [
  "personalInfo",
  "medicalHistory",
  "diagnoses",
  "treatments",
  "operations",
  "labResults",
  "imaging",
  "vaccinations",
  "allergies",
  "medications",
  "prescriptions",
  "familyHistory",
  "lifestyle",
  "exercise",
  "smoking",
  "alcohol",
  "mentalHealth",
  "dentalHistory",
  "pregnancyHistory",
  "genetics",
  "insurance",
  "emergencyContacts",
] as const;

export type EhrSection = (typeof EHR_SECTIONS)[number];

export async function getLifelongEhr(userId: string) {
  const [user, ehr, prescriptions, labOrders, images, metrics] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      include: { patientProfile: true, familyMembers: true },
    }),
    prisma.electronicHealthRecord.findUnique({ where: { userId } }),
    prisma.prescription.findMany({
      where: { patientId: userId },
      orderBy: { issuedAt: "desc" },
      take: 20,
    }),
    prisma.laboratoryOrder.findMany({
      where: { patientId: userId },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    prisma.medicalImage.findMany({
      where: { patientId: userId },
      orderBy: { studyDate: "desc" },
      take: 20,
      select: { id: true, modality: true, title: true, studyDate: true, aiAnalysis: true },
    }),
    prisma.healthMetric.findMany({
      where: { userId },
      orderBy: { recordedAt: "desc" },
      take: 30,
    }),
  ]);

  if (!user) return null;

  const profile = user.patientProfile;
  const merged = {
    personalInfo:
      ehr?.personalInfo ||
      JSON.stringify({
        name: user.name,
        email: user.email,
        phone: user.phone,
        gender: user.gender,
        bloodType: profile?.bloodType,
        preferredLanguage: profile?.preferredLanguage,
      }),
    medicalHistory: ehr?.medicalHistory || profile?.medicalHistory || null,
    diagnoses: ehr?.diagnoses || null,
    treatments: ehr?.treatments || null,
    operations: ehr?.operations || null,
    labResults:
      ehr?.labResults ||
      (labOrders.length
        ? labOrders.map((o) => `${o.testType} (${o.status}): ${o.result || "pending"}`).join("\n")
        : null),
    imaging:
      ehr?.imaging ||
      (images.length
        ? images.map((i) => `${i.modality}: ${i.title} (${i.studyDate.toISOString().slice(0, 10)})`).join("\n")
        : null),
    vaccinations: ehr?.vaccinations || null,
    allergies: ehr?.allergies || profile?.allergies || null,
    medications: ehr?.medications || profile?.medications || null,
    prescriptions:
      ehr?.prescriptions ||
      (prescriptions.length
        ? prescriptions.map((p) => `${p.medication} ${p.dosage || ""} — ${p.status}`).join("\n")
        : null),
    familyHistory:
      ehr?.familyHistory ||
      (user.familyMembers.length
        ? user.familyMembers.map((f) => `${f.name} (${f.relationship})`).join("; ")
        : null),
    lifestyle: ehr?.lifestyle || null,
    exercise: ehr?.exercise || null,
    smoking: ehr?.smoking || null,
    alcohol: ehr?.alcohol || null,
    mentalHealth: ehr?.mentalHealth || null,
    dentalHistory: ehr?.dentalHistory || null,
    pregnancyHistory: ehr?.pregnancyHistory || null,
    genetics: ehr?.genetics || null,
    insurance: ehr?.insurance || profile?.insuranceInfo || null,
    emergencyContacts: ehr?.emergencyContacts || profile?.emergencyContact || null,
    id: ehr?.id,
    updatedAt: ehr?.updatedAt,
    linked: {
      prescriptions,
      labOrders,
      images,
      recentMetrics: metrics,
    },
  };

  return merged;
}

export async function upsertLifelongEhr(userId: string, body: Record<string, unknown>) {
  const data: Record<string, string | null | undefined> = {};
  for (const key of EHR_SECTIONS) {
    if (body[key] != null) data[key] = String(body[key]);
  }

  // Keep PatientProfile in sync for overlapping clinical fields
  const profilePatch: Record<string, string | undefined> = {};
  if (body.allergies != null) profilePatch.allergies = String(body.allergies);
  if (body.medications != null) profilePatch.medications = String(body.medications);
  if (body.medicalHistory != null) profilePatch.medicalHistory = String(body.medicalHistory);
  if (body.insurance != null) profilePatch.insuranceInfo = String(body.insurance);
  if (body.emergencyContacts != null) profilePatch.emergencyContact = String(body.emergencyContacts);

  if (Object.keys(profilePatch).length) {
    await prisma.patientProfile.upsert({
      where: { userId },
      update: profilePatch,
      create: { userId, ...profilePatch },
    });
  }

  return prisma.electronicHealthRecord.upsert({
    where: { userId },
    update: data,
    create: { userId, ...data },
  });
}
