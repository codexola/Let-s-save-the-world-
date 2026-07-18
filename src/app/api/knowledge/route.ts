import { NextRequest, NextResponse } from "next/server";
import { requireSession, audit } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
  const type = req.nextUrl.searchParams.get("type");
  const q = (req.nextUrl.searchParams.get("q") || "").trim();
  const id = req.nextUrl.searchParams.get("id");

  if (id) {
    const item = await prisma.knowledgeItem.findUnique({ where: { id } });
    if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });
    await prisma.knowledgeItem.update({
      where: { id },
      data: { viewCount: { increment: 1 } },
    });
    return NextResponse.json({ item });
  }

  if (type === "drug" || type === "drugs") {
    const drugs = await prisma.drugMonograph.findMany({
      where: q
        ? {
            OR: [
              { name: { contains: q } },
              { ingredients: { contains: q } },
              { uses: { contains: q } },
              { warnings: { contains: q } },
            ],
          }
        : undefined,
      orderBy: { name: "asc" },
      take: 100,
    });
    return NextResponse.json({ drugs });
  }

  const items = await prisma.knowledgeItem.findMany({
    where: {
      published: true,
      ...(type ? { type } : {}),
      ...(q
        ? {
            OR: [
              { title: { contains: q } },
              { body: { contains: q } },
              { tags: { contains: q } },
              { summary: { contains: q } },
            ],
          }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  const counts = await prisma.knowledgeItem.groupBy({
    by: ["type"],
    where: { published: true },
    _count: true,
  });

  return NextResponse.json({
    items,
    counts: Object.fromEntries(counts.map((c) => [c.type, c._count])),
  });
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    if (!["ADMIN", "DEVELOPER", "DOCTOR", "HOSPITAL"].includes(session.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const body = await req.json();

    if (body.action === "create_item") {
      const item = await prisma.knowledgeItem.create({
        data: {
          type: String(body.type || "article"),
          title: String(body.title),
          summary: body.summary ? String(body.summary) : null,
          body: String(body.body),
          mediaUrl: body.mediaUrl ? String(body.mediaUrl) : null,
          tags: body.tags ? String(body.tags) : null,
          category: body.category ? String(body.category) : null,
          published: Boolean(body.published ?? true),
        },
      });
      await audit(session.id, "knowledge.create", "KnowledgeItem", item.id);
      return NextResponse.json({ item });
    }

    if (body.action === "create_drug") {
      const drug = await prisma.drugMonograph.create({
        data: {
          name: String(body.name),
          manufacturer: body.manufacturer || null,
          ingredients: body.ingredients || null,
          uses: body.uses || null,
          dosage: body.dosage || null,
          interactions: body.interactions || null,
          warnings: body.warnings || null,
          sideEffects: body.sideEffects || null,
          category: body.category || null,
        },
      });
      await audit(session.id, "knowledge.drug", "DrugMonograph", drug.id);
      return NextResponse.json({ drug });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error";
    const status = message === "UNAUTHORIZED" ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
