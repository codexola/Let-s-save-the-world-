import { NextRequest, NextResponse } from "next/server";
import { getSession, requireSession, audit } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  IMAGING_MODALITIES,
  ensureDemoImaging,
  runAiImageAnalysis,
  createSecureShare,
  requestSecondOpinion,
  placeholderStudySvg,
} from "@/lib/imaging";

export async function GET(req: NextRequest) {
  const session = await getSession();
  const sp = req.nextUrl.searchParams;
  const action = sp.get("action");
  const token = sp.get("token");

  if (action === "share" && token) {
    const img = await prisma.medicalImage.findFirst({
      where: { shareToken: token },
      include: { patient: { select: { name: true } } },
    });
    if (!img) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (img.shareExpiresAt && img.shareExpiresAt < new Date()) {
      return NextResponse.json({ error: "Share link expired" }, { status: 410 });
    }
    return NextResponse.json({
      image: {
        id: img.id,
        modality: img.modality,
        title: img.title,
        bodyPart: img.bodyPart,
        imageUrl: img.imageUrl,
        aiAnalysis: img.aiAnalysis,
        annotationsJson: img.annotationsJson,
        measurementsJson: img.measurementsJson,
        patientName: img.patient.name,
        studyDate: img.studyDate,
      },
    });
  }

  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (action === "modalities") {
    return NextResponse.json({ modalities: IMAGING_MODALITIES });
  }

  const patientId =
    (["DOCTOR", "ADMIN", "DEVELOPER", "NURSE", "HOSPITAL"].includes(session.role) && sp.get("patientId")
      ? String(sp.get("patientId"))
      : session.id) || session.id;

  if (patientId === session.id || ["DOCTOR", "ADMIN", "DEVELOPER", "NURSE", "HOSPITAL"].includes(session.role)) {
    const doctor = await prisma.user.findFirst({ where: { role: "DOCTOR" } });
    await ensureDemoImaging(patientId, doctor?.id);
  }

  const id = sp.get("id");
  if (id) {
    const image = await prisma.medicalImage.findUnique({
      where: { id },
      include: {
        patient: { select: { id: true, name: true } },
        orderedBy: { select: { id: true, name: true } },
        secondOpinionDoctor: { select: { id: true, name: true } },
      },
    });
    if (!image) return NextResponse.json({ error: "Not found" }, { status: 404 });
    let comparison = null;
    if (image.comparisonImageId) {
      comparison = await prisma.medicalImage.findUnique({ where: { id: image.comparisonImageId } });
    }
    return NextResponse.json({ image, comparison, modalities: IMAGING_MODALITIES });
  }

  const modality = sp.get("modality");
  const images = await prisma.medicalImage.findMany({
    where: {
      patientId: ["DOCTOR", "ADMIN", "DEVELOPER", "NURSE", "HOSPITAL"].includes(session.role) && !sp.get("patientId")
        ? undefined
        : patientId,
      ...(modality ? { modality } : {}),
    },
    orderBy: { studyDate: "desc" },
    take: 100,
    include: {
      patient: { select: { id: true, name: true } },
      secondOpinionDoctor: { select: { id: true, name: true } },
    },
  });

  return NextResponse.json({ images, modalities: IMAGING_MODALITIES });
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    const body = await req.json();
    const action = body.action as string;

    if (action === "create") {
      const patientId = String(body.patientId || session.id);
      const modality = String(body.modality || "X-Ray");
      if (!IMAGING_MODALITIES.includes(modality as (typeof IMAGING_MODALITIES)[number])) {
        return NextResponse.json({ error: "Unsupported modality" }, { status: 400 });
      }
      const title = String(body.title || `${modality} study`);
      const bodyPart = body.bodyPart ? String(body.bodyPart) : null;
      const image = await prisma.medicalImage.create({
        data: {
          patientId,
          orderedById: session.id,
          modality,
          title,
          bodyPart,
          imageUrl: body.imageUrl || placeholderStudySvg(modality, title, bodyPart || undefined),
          thumbnailUrl: placeholderStudySvg(modality, title, bodyPart || undefined),
          annotationsJson: JSON.stringify([]),
          measurementsJson: JSON.stringify([]),
          notes: body.notes ? String(body.notes) : null,
        },
      });
      await audit(session.id, "imaging.create", "MedicalImage", image.id);
      return NextResponse.json({ image });
    }

    if (action === "annotate") {
      const image = await prisma.medicalImage.update({
        where: { id: String(body.id) },
        data: { annotationsJson: JSON.stringify(body.annotations || []) },
      });
      return NextResponse.json({ image });
    }

    if (action === "measure") {
      const image = await prisma.medicalImage.update({
        where: { id: String(body.id) },
        data: { measurementsJson: JSON.stringify(body.measurements || []) },
      });
      return NextResponse.json({ image });
    }

    if (action === "compare") {
      const image = await prisma.medicalImage.update({
        where: { id: String(body.id) },
        data: { comparisonImageId: body.comparisonImageId ? String(body.comparisonImageId) : null },
      });
      return NextResponse.json({ image });
    }

    if (action === "ai_analyze") {
      const image = await runAiImageAnalysis(String(body.id));
      await audit(session.id, "imaging.ai", "MedicalImage", image.id);
      return NextResponse.json({ image });
    }

    if (action === "share") {
      const image = await createSecureShare(String(body.id), Number(body.hours) || 72);
      await audit(session.id, "imaging.share", "MedicalImage", image.id);
      return NextResponse.json({
        image,
        shareUrl: `/api/imaging?action=share&token=${image.shareToken}`,
      });
    }

    if (action === "second_opinion") {
      let doctorId = body.doctorId ? String(body.doctorId) : "";
      if (!doctorId) {
        const doc = await prisma.user.findFirst({ where: { email: "doctor@medcare.local" } });
        doctorId = doc?.id || "";
      }
      if (!doctorId) return NextResponse.json({ error: "Doctor not found" }, { status: 404 });
      const image = await requestSecondOpinion({
        imageId: String(body.id),
        doctorId,
        notes: body.notes ? String(body.notes) : undefined,
        actorId: session.id,
      });
      return NextResponse.json({ image });
    }

    if (action === "second_opinion_respond") {
      if (!["DOCTOR", "ADMIN", "DEVELOPER"].includes(session.role)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      const image = await prisma.medicalImage.update({
        where: { id: String(body.id) },
        data: {
          secondOpinionStatus: "completed",
          secondOpinionNotes: String(body.notes || "Second opinion completed."),
          secondOpinionAt: new Date(),
          secondOpinionDoctorId: session.id,
        },
      });
      return NextResponse.json({ image });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error";
    const status = message === "UNAUTHORIZED" ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
