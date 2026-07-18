import { NextRequest, NextResponse } from "next/server";
import { getSession, requireSession, audit } from "@/lib/auth";
import { prisma } from "@/lib/db";

function buildMutualReviews(
  given: Array<{ id: string; authorId: string; targetId: string; rating: number; comment: string | null; author: { id: string; name: string; photoUrl: string | null } }>,
  received: typeof given
) {
  const mutual: Array<{
    partner: { id: string; name: string; photoUrl: string | null };
    given: (typeof given)[0];
    received: (typeof received)[0];
  }> = [];

  for (const g of given) {
    const r = received.find((x) => x.authorId === g.targetId);
    if (r) {
      mutual.push({
        partner: r.author,
        given: g,
        received: r,
      });
    }
  }
  return mutual;
}

export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get("userId");
  const mutual = req.nextUrl.searchParams.get("mutual") === "1";
  const session = await getSession();
  const targetId = userId || session?.id;

  if (!targetId) {
    return NextResponse.json({ error: "userId required or sign in" }, { status: 400 });
  }

  const given = await prisma.review.findMany({
    where: { authorId: targetId },
    include: { author: { select: { id: true, name: true, photoUrl: true } } },
    orderBy: { createdAt: "desc" },
  });

  const received = await prisma.review.findMany({
    where: { targetId },
    include: { author: { select: { id: true, name: true, photoUrl: true } } },
    orderBy: { createdAt: "desc" },
  });

  const mutualReviews = mutual ? buildMutualReviews(given, received) : [];

  return NextResponse.json({ given, received, mutualReviews });
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    const body = await req.json();

    const review = await prisma.review.create({
      data: {
        authorId: session.id,
        targetType: String(body.targetType || "user"),
        targetId: String(body.targetId),
        rating: Number(body.rating),
        comment: body.comment ? String(body.comment) : null,
        verified: Boolean(body.verified ?? false),
      },
      include: { author: { select: { id: true, name: true, photoUrl: true } } },
    });

    await audit(session.id, "review.create", "Review", review.id);
    return NextResponse.json({ review });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error";
    const status = message === "UNAUTHORIZED" ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
