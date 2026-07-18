import { NextRequest, NextResponse } from "next/server";
import { getSession, audit } from "@/lib/auth";
import { sendEmail } from "@/lib/mail";
import { prisma } from "@/lib/db";

async function applyCoupon(code: string | undefined, subtotal: number) {
  if (!code) return { discountYen: 0, coupon: null as null | { code: string } };
  const coupon = await prisma.coupon.findUnique({ where: { code: code.toUpperCase() } });
  if (!coupon || !coupon.active) throw new Error("Invalid coupon");
  if (coupon.expiresAt && coupon.expiresAt < new Date()) throw new Error("Coupon expired");
  if (coupon.maxUses != null && coupon.usedCount >= coupon.maxUses) throw new Error("Coupon exhausted");
  let discountYen = coupon.discountYen;
  if (coupon.discountPercent > 0) {
    discountYen += Math.floor((subtotal * coupon.discountPercent) / 100);
  }
  return { discountYen: Math.min(discountYen, subtotal), coupon };
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const q = (sp.get("q") || "").trim();
  const medicineId = sp.get("id");
  const compare = sp.get("compare");

  if (medicineId) {
    const medicine = await prisma.medicine.findUnique({
      where: { id: medicineId },
      include: {
        pharmacy: {
          select: {
            id: true,
            name: true,
            deliveryAvailable: true,
            pickupAvailable: true,
            discounts: true,
            userId: true,
          },
        },
      },
    });
    if (!medicine) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const alternatives = medicine.alternatives
      ? await prisma.medicine.findMany({
          where: {
            OR: [
              { name: { in: medicine.alternatives.split(",").map((s) => s.trim()).filter(Boolean) } },
              { ingredients: medicine.ingredients ? { contains: medicine.ingredients.split(",")[0]?.trim() || "" } : undefined },
            ],
            id: { not: medicine.id },
          },
          include: { pharmacy: { select: { name: true, deliveryAvailable: true } } },
          take: 10,
        })
      : await prisma.medicine.findMany({
          where: {
            id: { not: medicine.id },
            OR: [
              medicine.ingredients
                ? { ingredients: { contains: medicine.ingredients.split(",")[0]?.trim() || "" } }
                : { name: { contains: medicine.name.slice(0, 4) } },
            ],
          },
          include: { pharmacy: { select: { name: true, deliveryAvailable: true } } },
          take: 10,
        });

    const reviews = await prisma.review.findMany({
      where: { targetType: "medicine", targetId: medicine.id },
      include: { author: { select: { id: true, name: true, photoUrl: true } } },
      orderBy: { createdAt: "desc" },
      take: 20,
    });

    const pricePeers = await prisma.medicine.findMany({
      where: { name: { contains: medicine.name.split(" ")[0] } },
      include: { pharmacy: { select: { name: true, deliveryAvailable: true } } },
      orderBy: { priceYen: "asc" },
      take: 20,
    });

    return NextResponse.json({
      medicine,
      alternatives,
      reviews,
      priceComparison: pricePeers,
    });
  }

  if (compare === "1") {
    const name = (sp.get("name") || q || "").trim();
    const medicines = await prisma.medicine.findMany({
      where: name ? { name: { contains: name } } : undefined,
      include: {
        pharmacy: {
          select: { id: true, name: true, deliveryAvailable: true, discounts: true },
        },
      },
      orderBy: { priceYen: "asc" },
      take: 50,
    });
    return NextResponse.json({ comparison: medicines });
  }

  const medicines = await prisma.medicine.findMany({
    where: q
      ? {
          OR: [
            { name: { contains: q } },
            { manufacturer: { contains: q } },
            { ingredients: { contains: q } },
            { warnings: { contains: q } },
          ],
        }
      : undefined,
    include: {
      pharmacy: {
        select: {
          id: true,
          name: true,
          deliveryAvailable: true,
          pickupAvailable: true,
          discounts: true,
        },
      },
    },
    orderBy: { priceYen: "asc" },
    take: 100,
  });

  return NextResponse.json({ medicines });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();

  if (body.action === "order" || !body.action) {
    const medicineId = String(body.medicineId || "");
    const quantity = Math.max(1, Number(body.quantity) || 1);
    const delivery = Boolean(body.delivery);

    const medicine = await prisma.medicine.findUnique({
      where: { id: medicineId },
      include: { pharmacy: true },
    });
    if (!medicine) return NextResponse.json({ error: "Medicine not found" }, { status: 404 });
    if (medicine.stock < quantity) {
      return NextResponse.json({ error: "Insufficient stock / unavailable" }, { status: 400 });
    }
    if (delivery && !medicine.pharmacy.deliveryAvailable) {
      return NextResponse.json({ error: "Delivery not available from this pharmacy" }, { status: 400 });
    }

    const subtotal = medicine.priceYen * quantity;
    let discountYen = 0;
    try {
      const applied = await applyCoupon(body.couponCode, subtotal);
      discountYen = applied.discountYen;
      if (applied.coupon) {
        await prisma.coupon.update({
          where: { code: applied.coupon.code },
          data: { usedCount: { increment: 1 } },
        });
      }
    } catch (e) {
      if (body.couponCode) {
        return NextResponse.json({ error: e instanceof Error ? e.message : "Coupon error" }, { status: 400 });
      }
    }

    const total = Math.max(0, subtotal - discountYen);
    await prisma.medicine.update({
      where: { id: medicineId },
      data: { stock: medicine.stock - quantity },
    });

    const order = await prisma.marketplaceOrder.create({
      data: {
        userId: session.id,
        medicineId,
        quantity,
        totalYen: total,
        delivery,
        couponCode: body.couponCode ? String(body.couponCode).toUpperCase() : null,
        status: delivery ? "shipping" : "ready_pickup",
      },
    });

    await prisma.invoice.create({
      data: {
        userId: session.id,
        amountYen: total,
        description: `Marketplace: ${quantity}× ${medicine.name}${delivery ? " (delivery)" : ""}`,
        status: "OPEN",
      },
    });

    await sendEmail({
      to: session.email,
      userId: session.id,
      subject: "Marketplace order confirmed",
      body: `Order ${order.id}: ${quantity}× ${medicine.name} from ${medicine.pharmacy.name}. Subtotal ¥${subtotal.toLocaleString()}, discount ¥${discountYen.toLocaleString()}, total ¥${total.toLocaleString()}. ${delivery ? "Delivery requested." : "Pickup available."}`,
    });

    await audit(session.id, "marketplace.order", "MarketplaceOrder", order.id);
    return NextResponse.json({
      ok: true,
      order: {
        id: order.id,
        medicineId,
        quantity,
        subtotalYen: subtotal,
        discountYen,
        totalYen: total,
        delivery,
        pharmacy: medicine.pharmacy.name,
        availability: medicine.stock - quantity,
      },
    });
  }

  if (body.action === "review") {
    const review = await prisma.review.create({
      data: {
        authorId: session.id,
        targetType: "medicine",
        targetId: String(body.medicineId),
        rating: Number(body.rating),
        comment: body.comment ? String(body.comment) : null,
        verified: true,
      },
    });
    return NextResponse.json({ review });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
