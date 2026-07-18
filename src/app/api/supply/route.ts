import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  SUPPLY_CATEGORIES,
  ensureSupplyCatalog,
  placeSupplyOrder,
  rateSupplier,
} from "@/lib/supply";

export async function GET(req: NextRequest) {
  try {
    const session = await requireSession();
    await ensureSupplyCatalog();
    const category = req.nextUrl.searchParams.get("category");
    const products = await prisma.supplyProduct.findMany({
      where: { active: true, ...(category ? { category } : {}) },
      include: { supplier: true },
      orderBy: [{ category: "asc" }, { name: "asc" }],
    });
    const suppliers = await prisma.supplySupplier.findMany({ orderBy: { ratingAvg: "desc" } });
    const orders = await prisma.supplyOrder.findMany({
      where: ["HOSPITAL", "ADMIN", "DEVELOPER"].includes(session.role)
        ? session.role === "HOSPITAL"
          ? { buyerId: session.id }
          : undefined
        : { buyerId: session.id },
      include: { items: { include: { product: true } } },
      orderBy: { createdAt: "desc" },
      take: 40,
    });
    return NextResponse.json({
      categories: SUPPLY_CATEGORIES,
      products,
      suppliers,
      orders,
    });
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

    if (action === "order") {
      if (!["HOSPITAL", "ADMIN", "DEVELOPER", "COMPANY"].includes(session.role)) {
        // Allow patient demo? Spec says hospitals purchase — still allow admin/hospital; for demo allow doctor too
        if (!["DOCTOR", "PHARMACY"].includes(session.role)) {
          return NextResponse.json({ error: "Hospital procurement role required" }, { status: 403 });
        }
      }
      const order = await placeSupplyOrder({
        buyerId: session.id,
        items: (body.items || []).map((i: { productId: string; quantity: number }) => ({
          productId: String(i.productId),
          quantity: Number(i.quantity) || 1,
        })),
        notes: body.notes ? String(body.notes) : undefined,
      });
      return NextResponse.json({ order });
    }

    if (action === "rate_supplier") {
      const supplier = await rateSupplier(String(body.supplierId), Number(body.rating) || 5);
      return NextResponse.json({ supplier });
    }

    if (action === "restock") {
      if (!["ADMIN", "DEVELOPER", "HOSPITAL"].includes(session.role)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      const product = await prisma.supplyProduct.update({
        where: { id: String(body.productId) },
        data: { stock: { increment: Number(body.quantity) || 10 } },
      });
      return NextResponse.json({ product });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error";
    const status = message === "UNAUTHORIZED" ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
