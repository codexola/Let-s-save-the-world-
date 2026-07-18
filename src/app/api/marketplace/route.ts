import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { sendEmail } from "@/lib/mail";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") || "").trim();
  const medicines = await prisma.medicine.findMany({
    where: q ? { name: { contains: q } } : undefined,
    include: { pharmacy: { select: { id: true, name: true, deliveryAvailable: true } } },
    orderBy: { name: "asc" },
    take: 100,
  });
  return NextResponse.json({ medicines });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const medicineId = String(body.medicineId || "");
  const quantity = Math.max(1, Number(body.quantity) || 1);

  const medicine = await prisma.medicine.findUnique({
    where: { id: medicineId },
    include: { pharmacy: true },
  });
  if (!medicine) return NextResponse.json({ error: "Medicine not found" }, { status: 404 });
  if (medicine.stock < quantity) {
    return NextResponse.json({ error: "Insufficient stock" }, { status: 400 });
  }

  await prisma.medicine.update({
    where: { id: medicineId },
    data: { stock: medicine.stock - quantity },
  });

  const total = medicine.priceYen * quantity;
  await sendEmail({
    to: session.email,
    userId: session.id,
    subject: "Marketplace order confirmed",
    body: `Your order: ${quantity}× ${medicine.name} from ${medicine.pharmacy.name}. Total: ¥${total.toLocaleString()}.`,
  });

  return NextResponse.json({
    ok: true,
    order: {
      medicineId,
      quantity,
      totalYen: total,
      pharmacy: medicine.pharmacy.name,
    },
  });
}
