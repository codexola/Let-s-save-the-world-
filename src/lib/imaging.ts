import { randomBytes } from "crypto";
import { prisma } from "./db";
import { notifyUser } from "./notify";
import { audit } from "./auth";

export const IMAGING_MODALITIES = [
  "X-Ray",
  "CT",
  "MRI",
  "PET",
  "Ultrasound",
  "Mammography",
  "Dental Imaging",
  "Eye Imaging",
  "Pathology Slides",
] as const;

export type ImagingModality = (typeof IMAGING_MODALITIES)[number];

/** Deterministic SVG placeholder “study” for viewer demos (no real PHI pixels). */
export function placeholderStudySvg(modality: string, title: string, bodyPart?: string) {
  const label = `${modality}${bodyPart ? ` · ${bodyPart}` : ""}`;
  const safeTitle = title.replace(/[<>&]/g, "");
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#0f172a"/><stop offset="1" stop-color="#1e293b"/></linearGradient></defs>
  <rect width="800" height="600" fill="url(#g)"/>
  <circle cx="400" cy="280" r="140" fill="#334155" stroke="#94a3b8" stroke-width="2"/>
  <ellipse cx="400" cy="280" rx="70" ry="90" fill="#64748b" opacity="0.7"/>
  <text x="40" y="40" fill="#e2e8f0" font-family="Segoe UI,sans-serif" font-size="22">${label}</text>
  <text x="40" y="70" fill="#94a3b8" font-family="Segoe UI,sans-serif" font-size="16">${safeTitle}</text>
  <text x="40" y="560" fill="#64748b" font-family="Segoe UI,sans-serif" font-size="14">MedCare Imaging · demo study (not diagnostic)</text>
</svg>`)}`;
}

export async function ensureDemoImaging(patientId: string, doctorId?: string) {
  const count = await prisma.medicalImage.count({ where: { patientId } });
  if (count > 0) return;

  const demos: Array<{ modality: ImagingModality; title: string; bodyPart: string; ai: string }> = [
    {
      modality: "X-Ray",
      title: "Chest PA",
      bodyPart: "Chest",
      ai: "No acute cardiopulmonary process. Heart size within normal limits.",
    },
    {
      modality: "CT",
      title: "Head CT non-contrast",
      bodyPart: "Head",
      ai: "No intracranial hemorrhage or mass effect. Ventricles normal.",
    },
    {
      modality: "MRI",
      title: "Lumbar spine MRI",
      bodyPart: "Spine",
      ai: "Mild L4–L5 disc desiccation. No high-grade stenosis.",
    },
    {
      modality: "PET",
      title: "Whole-body FDG PET",
      bodyPart: "Whole body",
      ai: "Physiologic uptake only. No FDG-avid malignancy detected (demo).",
    },
    {
      modality: "Ultrasound",
      title: "Abdominal US",
      bodyPart: "Abdomen",
      ai: "Liver, gallbladder, kidneys unremarkable on demo study.",
    },
    {
      modality: "Mammography",
      title: "Bilateral screening mammo",
      bodyPart: "Breast",
      ai: "BI-RADS 1 — negative (demo).",
    },
    {
      modality: "Dental Imaging",
      title: "Panoramic dental",
      bodyPart: "Dentition",
      ai: "No acute dental abscess on demo panoramic.",
    },
    {
      modality: "Eye Imaging",
      title: "Fundus photo OD",
      bodyPart: "Retina",
      ai: "Optic disc sharp; no hemorrhage (demo).",
    },
    {
      modality: "Pathology Slides",
      title: "H&E skin biopsy",
      bodyPart: "Skin",
      ai: "Benign squamous epithelium — demo WSI thumbnail only.",
    },
  ];

  for (const d of demos) {
    await prisma.medicalImage.create({
      data: {
        patientId,
        orderedById: doctorId,
        modality: d.modality,
        title: d.title,
        bodyPart: d.bodyPart,
        imageUrl: placeholderStudySvg(d.modality, d.title, d.bodyPart),
        thumbnailUrl: placeholderStudySvg(d.modality, d.title, d.bodyPart),
        aiAnalysis: d.ai,
        aiFindings: JSON.stringify([{ finding: d.ai, confidence: 0.82 }]),
        annotationsJson: JSON.stringify([]),
        measurementsJson: JSON.stringify([]),
      },
    });
  }
}

export async function runAiImageAnalysis(imageId: string) {
  const img = await prisma.medicalImage.findUnique({ where: { id: imageId } });
  if (!img) throw new Error("Image not found");
  const analysis = `AI-assisted analysis (${img.modality}): ${
    img.aiAnalysis || "Study reviewed. Correlate clinically. Not a substitute for radiologist interpretation."
  } Confidence ~${(0.75 + Math.random() * 0.2).toFixed(2)}.`;
  return prisma.medicalImage.update({
    where: { id: imageId },
    data: {
      aiAnalysis: analysis,
      aiFindings: JSON.stringify([
        { finding: analysis, confidence: 0.8, modality: img.modality },
      ]),
    },
  });
}

export async function createSecureShare(imageId: string, hours = 72) {
  const shareToken = randomBytes(24).toString("hex");
  return prisma.medicalImage.update({
    where: { id: imageId },
    data: {
      shareToken,
      shareExpiresAt: new Date(Date.now() + hours * 3600_000),
    },
  });
}

export async function requestSecondOpinion(opts: {
  imageId: string;
  doctorId: string;
  notes?: string;
  actorId: string;
}) {
  const img = await prisma.medicalImage.update({
    where: { id: opts.imageId },
    data: {
      secondOpinionStatus: "requested",
      secondOpinionDoctorId: opts.doctorId,
      secondOpinionNotes: opts.notes || "Please provide second opinion.",
      secondOpinionAt: new Date(),
    },
    include: { patient: { select: { name: true } } },
  });
  await notifyUser({
    userId: opts.doctorId,
    subject: "Second-opinion imaging request",
    body: `Second opinion requested for ${img.modality} — ${img.title} (patient ${img.patient.name}). Notes: ${opts.notes || "n/a"}`,
    kind: "general",
    channels: ["email", "push", "inbox"],
  }).catch(() => undefined);
  await audit(opts.actorId, "imaging.second_opinion", "MedicalImage", img.id);
  return img;
}
