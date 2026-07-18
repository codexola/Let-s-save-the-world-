import { prisma } from "./db";
import { notifyUser } from "./notify";
import { audit } from "./auth";

export const SUPPLY_CATEGORIES = [
  "medical_equipment",
  "medicine",
  "consumables",
  "laboratory_supplies",
  "surgical_equipment",
  "ppe",
] as const;

export async function ensureSupplyCatalog() {
  const count = await prisma.supplyProduct.count();
  if (count > 0) return;

  const suppliers = await Promise.all([
    prisma.supplySupplier.create({
      data: {
        name: "MedSupply Japan Co.",
        contactEmail: "sales@medsupply.example",
        ratingAvg: 4.8,
        reviewCount: 42,
        verified: true,
        notes: "Primary PPE and consumables vendor",
      },
    }),
    prisma.supplySupplier.create({
      data: {
        name: "OrthoSurgical Instruments Ltd.",
        contactEmail: "orders@orthosurg.example",
        ratingAvg: 4.6,
        reviewCount: 28,
        verified: true,
      },
    }),
    prisma.supplySupplier.create({
      data: {
        name: "LabReagent Global",
        contactEmail: "support@labreagent.example",
        ratingAvg: 4.7,
        reviewCount: 35,
        verified: true,
      },
    }),
  ]);

  const products = [
    { name: "Patient monitor (portable)", category: "medical_equipment", priceYen: 280000, stock: 12, supplierId: suppliers[0].id, sku: "EQ-MON-01" },
    { name: "Infusion pump", category: "medical_equipment", priceYen: 195000, stock: 20, supplierId: suppliers[0].id, sku: "EQ-INF-02" },
    { name: "Amoxicillin 500mg (box 100)", category: "medicine", priceYen: 4200, stock: 200, supplierId: suppliers[0].id, sku: "MED-AMX-500" },
    { name: "Sterile gauze pads (case)", category: "consumables", priceYen: 6800, stock: 150, supplierId: suppliers[0].id, sku: "CON-GZ-01" },
    { name: "Blood collection tubes (100)", category: "laboratory_supplies", priceYen: 8900, stock: 80, supplierId: suppliers[2].id, sku: "LAB-TUBE-100" },
    { name: "Reagent kit — CBC", category: "laboratory_supplies", priceYen: 22000, stock: 40, supplierId: suppliers[2].id, sku: "LAB-CBC-KIT" },
    { name: "Surgical instrument tray set", category: "surgical_equipment", priceYen: 85000, stock: 15, supplierId: suppliers[1].id, sku: "SUR-TRAY-01" },
    { name: "Laparoscopic trocar (box 5)", category: "surgical_equipment", priceYen: 31000, stock: 25, supplierId: suppliers[1].id, sku: "SUR-TRO-5" },
    { name: "N95 respirator (box 20)", category: "ppe", priceYen: 3600, stock: 500, supplierId: suppliers[0].id, sku: "PPE-N95-20" },
    { name: "Isolation gown (case 50)", category: "ppe", priceYen: 9800, stock: 120, supplierId: suppliers[0].id, sku: "PPE-GOWN-50" },
    { name: "Face shield (pack 10)", category: "ppe", priceYen: 2400, stock: 200, supplierId: suppliers[0].id, sku: "PPE-FS-10" },
    { name: "IV catheter 20G (box 50)", category: "consumables", priceYen: 5100, stock: 90, supplierId: suppliers[0].id, sku: "CON-IV-20" },
  ];

  await prisma.supplyProduct.createMany({
    data: products.map((p) => ({
      ...p,
      description: `${p.name} — hospital procurement catalog`,
      unit: "unit",
      ratingAvg: 4.5 + Math.random() * 0.4,
      active: true,
    })),
  });
}

export async function placeSupplyOrder(opts: {
  buyerId: string;
  items: Array<{ productId: string; quantity: number }>;
  notes?: string;
}) {
  await ensureSupplyCatalog();
  if (!opts.items.length) throw new Error("No items");
  let totalYen = 0;
  const lines: Array<{ productId: string; quantity: number; unitYen: number }> = [];
  for (const item of opts.items) {
    const product = await prisma.supplyProduct.findUnique({ where: { id: item.productId } });
    if (!product || !product.active) throw new Error("Product not found");
    if (product.stock < item.quantity) throw new Error(`Insufficient stock for ${product.name}`);
    totalYen += product.priceYen * item.quantity;
    lines.push({ productId: product.id, quantity: item.quantity, unitYen: product.priceYen });
  }

  const order = await prisma.supplyOrder.create({
    data: {
      buyerId: opts.buyerId,
      status: "placed",
      totalYen,
      notes: opts.notes,
      items: { create: lines },
    },
    include: { items: { include: { product: true } } },
  });

  for (const line of lines) {
    await prisma.supplyProduct.update({
      where: { id: line.productId },
      data: { stock: { decrement: line.quantity } },
    });
  }

  await notifyUser({
    userId: opts.buyerId,
    subject: "Medical supply order placed",
    body: `Order total ¥${totalYen.toLocaleString()} · ${lines.length} line(s). Inventory updated.`,
    kind: "general",
    channels: ["email", "push"],
  }).catch(() => undefined);

  await audit(opts.buyerId, "supply.order", "SupplyOrder", order.id);
  return order;
}

export async function rateSupplier(supplierId: string, rating: number) {
  const supplier = await prisma.supplySupplier.findUnique({ where: { id: supplierId } });
  if (!supplier) throw new Error("Supplier not found");
  const reviewCount = supplier.reviewCount + 1;
  const ratingAvg = (supplier.ratingAvg * supplier.reviewCount + rating) / reviewCount;
  return prisma.supplySupplier.update({
    where: { id: supplierId },
    data: { reviewCount, ratingAvg },
  });
}
