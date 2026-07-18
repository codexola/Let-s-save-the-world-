import { NextRequest, NextResponse } from "next/server";
import { getSession, requireSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  advanceLabOrder,
  createLabOrder,
  ensureLabCatalog,
  LAB_CATEGORIES,
  LAB_WORKFLOW,
  type LabStatus,
} from "@/lib/lab";

export async function GET(req: NextRequest) {
  const session = await getSession();
  const sp = req.nextUrl.searchParams;
  const action = sp.get("action");

  await ensureLabCatalog();

  if (action === "catalog" || !session) {
    const category = sp.get("category");
    const q = (sp.get("q") || "").trim();
    const tests = await prisma.labTest.findMany({
      where: {
        active: true,
        ...(category ? { category } : {}),
        ...(q
          ? {
              OR: [
                { name: { contains: q } },
                { code: { contains: q } },
                { category: { contains: q } },
              ],
            }
          : {}),
      },
      include: { laboratory: { select: { id: true, name: true, turnaroundHoursAvg: true, homeSampleCollection: true } } },
      orderBy: [{ category: "asc" }, { name: "asc" }],
    });
    const labs = await prisma.laboratoryProfile.findMany({ orderBy: { name: "asc" } });
    return NextResponse.json({
      tests,
      laboratories: labs,
      categories: LAB_CATEGORIES,
      workflow: LAB_WORKFLOW,
    });
  }

  if (action === "profiles") {
    const labs = await prisma.laboratoryProfile.findMany({
      include: { _count: { select: { tests: true, orders: true } } },
    });
    return NextResponse.json({ laboratories: labs });
  }

  const id = sp.get("id");
  if (id) {
    const order = await prisma.laboratoryOrder.findUnique({
      where: { id },
      include: {
        patient: { select: { id: true, name: true, email: true } },
        doctor: { select: { id: true, name: true } },
        laboratory: true,
      },
    });
    if (!order) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ order });
  }

  const isStaff = ["DOCTOR", "ADMIN", "DEVELOPER", "HOSPITAL", "NURSE"].includes(session.role);
  const orders = await prisma.laboratoryOrder.findMany({
    where: isStaff
      ? session.role === "DOCTOR"
        ? { OR: [{ doctorId: session.id }, { patientId: session.id }] }
        : undefined
      : { patientId: session.id },
    include: {
      patient: { select: { id: true, name: true } },
      doctor: { select: { id: true, name: true } },
      laboratory: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return NextResponse.json({ orders, workflow: LAB_WORKFLOW, categories: LAB_CATEGORIES });
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    const body = await req.json();
    const action = body.action as string;

    if (action === "order") {
      if (!["DOCTOR", "ADMIN", "DEVELOPER"].includes(session.role)) {
        return NextResponse.json({ error: "Only doctors can place lab orders" }, { status: 403 });
      }
      let patientId = body.patientId ? String(body.patientId) : "";
      if (!patientId && body.patientEmail) {
        const patient = await prisma.user.findUnique({
          where: { email: String(body.patientEmail).trim().toLowerCase() },
        });
        if (!patient) return NextResponse.json({ error: "Patient not found" }, { status: 404 });
        patientId = patient.id;
      }
      if (!patientId) return NextResponse.json({ error: "patientId or patientEmail required" }, { status: 400 });
      const order = await createLabOrder({
        patientId,
        doctorId: session.id,
        testCode: String(body.testCode),
        homeCollection: body.homeCollection,
        collectionAddress: body.collectionAddress,
        laboratoryId: body.laboratoryId,
      });
      return NextResponse.json({ order });
    }

    if (action === "advance") {
      const status = String(body.status) as LabStatus;
      if (!LAB_WORKFLOW.includes(status)) {
        return NextResponse.json({ error: "Invalid status" }, { status: 400 });
      }
      const order = await advanceLabOrder(String(body.id), status, {
        result: body.result,
        doctorNotes: body.doctorNotes,
        actorId: session.id,
      });
      return NextResponse.json({ order });
    }

    if (action === "collect") {
      const order = await advanceLabOrder(String(body.id), "sample_collected", { actorId: session.id });
      return NextResponse.json({ order });
    }

    if (action === "analyze") {
      await advanceLabOrder(String(body.id), "analyzing", { actorId: session.id });
      const order = await advanceLabOrder(String(body.id), "result_ready", {
        result: body.result || "Automated analysis complete — values within demo reference ranges unless noted.",
        actorId: session.id,
      });
      return NextResponse.json({ order });
    }

    if (action === "review") {
      if (!["DOCTOR", "ADMIN", "DEVELOPER"].includes(session.role)) {
        return NextResponse.json({ error: "Doctor review required" }, { status: 403 });
      }
      const order = await advanceLabOrder(String(body.id), "doctor_reviewed", {
        doctorNotes: body.doctorNotes || "Reviewed — discuss with patient as needed.",
        actorId: session.id,
      });
      return NextResponse.json({ order });
    }

    if (action === "notify_patient") {
      const order = await advanceLabOrder(String(body.id), "patient_notified", { actorId: session.id });
      return NextResponse.json({ order });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error";
    const status = message === "UNAUTHORIZED" ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
