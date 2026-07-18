import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  createPharmacyDelivery,
  tickDeliveryTracking,
  markDelivered,
  setupAutoRefill,
  processDueRefills,
  syncPharmacyInventory,
} from "@/lib/pharmacy-delivery";

export async function GET(req: NextRequest) {
  try {
    const session = await requireSession();
    const sp = req.nextUrl.searchParams;
    const track = sp.get("tracking");
    if (track) {
      const delivery = await prisma.pharmacyDelivery.findUnique({ where: { trackingCode: track.toUpperCase() } });
      if (!delivery) return NextResponse.json({ error: "Not found" }, { status: 404 });
      return NextResponse.json({ delivery });
    }
    const deliveries = await prisma.pharmacyDelivery.findMany({
      where: session.role === "PHARMACY" ? undefined : { patientId: session.id },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    const refills = await prisma.pharmacyRefill.findMany({
      where: { patientId: session.id, active: true },
      orderBy: { nextRefillAt: "asc" },
    });
    const medicines = await prisma.medicine.findMany({ take: 50, orderBy: { name: "asc" } });
    return NextResponse.json({ deliveries, refills, medicines });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error";
    const status = message === "UNAUTHORIZED" ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    const body = await req.json();
    const action = body.action as string;

    if (action === "deliver" || action === "same_day") {
      const delivery = await createPharmacyDelivery({
        patientId: session.id,
        medicineName: String(body.medicineName || "Prescribed medication"),
        address: body.address ? String(body.address) : undefined,
        sameDay: body.sameDay !== false,
        coldChain: Boolean(body.coldChain),
        prescriptionId: body.prescriptionId ? String(body.prescriptionId) : undefined,
        prescriptionImage: body.prescriptionImage ? String(body.prescriptionImage) : undefined,
      });
      return NextResponse.json({ delivery });
    }

    if (action === "upload_rx") {
      const delivery = await createPharmacyDelivery({
        patientId: session.id,
        medicineName: String(body.medicineName || "From uploaded prescription"),
        prescriptionImage: String(body.prescriptionImage || "data:image/svg+xml;uploaded-rx-demo"),
        sameDay: true,
        coldChain: Boolean(body.coldChain),
        address: body.address ? String(body.address) : undefined,
      });
      return NextResponse.json({ delivery, message: "Prescription uploaded and delivery created" });
    }

    if (action === "track") {
      const delivery = await tickDeliveryTracking(String(body.id));
      return NextResponse.json({ delivery });
    }

    if (action === "delivered") {
      const delivery = await markDelivered(String(body.id));
      return NextResponse.json({ delivery });
    }

    if (action === "auto_refill") {
      const refill = await setupAutoRefill({
        patientId: session.id,
        medication: String(body.medication),
        intervalDays: body.intervalDays != null ? Number(body.intervalDays) : 30,
      });
      return NextResponse.json({ refill });
    }

    if (action === "process_refills") {
      const created = await processDueRefills(session.id);
      return NextResponse.json({ created });
    }

    if (action === "sync_inventory") {
      const result = await syncPharmacyInventory(
        session.role === "PHARMACY" ? session.id : undefined
      );
      return NextResponse.json(result);
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error";
    const status = message === "UNAUTHORIZED" ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
