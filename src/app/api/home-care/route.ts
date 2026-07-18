import { NextRequest, NextResponse } from "next/server";
import { requireSession, audit } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { HOME_CARE_SERVICES, ensureHomeCareSeed, requestHomeCare } from "@/lib/homecare";

export async function GET() {
  try {
    const session = await requireSession();
    const nurse = await prisma.user.findFirst({ where: { role: "NURSE" } });
    await ensureHomeCareSeed(session.id, nurse?.id);
    const orders = await prisma.homeCareOrder.findMany({
      where:
        session.role === "PATIENT"
          ? { patientId: session.id }
          : ["DOCTOR", "NURSE", "ADMIN", "DEVELOPER"].includes(session.role)
            ? { OR: [{ patientId: session.id }, { providerId: session.id }] }
            : { patientId: session.id },
      include: {
        patient: { select: { id: true, name: true } },
        provider: { select: { id: true, name: true, role: true } },
      },
      orderBy: { scheduledAt: "asc" },
    });
    return NextResponse.json({ services: HOME_CARE_SERVICES, orders });
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

    if (action === "request") {
      const order = await requestHomeCare({
        patientId: session.id,
        serviceType: String(body.serviceType),
        address: body.address ? String(body.address) : undefined,
        scheduledAt: body.scheduledAt ? String(body.scheduledAt) : undefined,
        notes: body.notes ? String(body.notes) : undefined,
        equipmentItem: body.equipmentItem ? String(body.equipmentItem) : undefined,
      });
      return NextResponse.json({ order });
    }

    if (action === "update_status") {
      const order = await prisma.homeCareOrder.update({
        where: { id: String(body.id) },
        data: {
          status: String(body.status),
          completedAt: body.status === "completed" ? new Date() : undefined,
          notes: body.notes != null ? String(body.notes) : undefined,
        },
      });
      await audit(session.id, "homecare.status", "HomeCareOrder", order.id);
      return NextResponse.json({ order });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error";
    const status = message === "UNAUTHORIZED" ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
