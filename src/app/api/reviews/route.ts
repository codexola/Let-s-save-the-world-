import { NextRequest, NextResponse } from "next/server";
import { getSession, requireSession, audit } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  allowedReviewPair,
  hasVerifiedRelationship,
  resolveTargetUserId,
  scoreReviewFraud,
  REVIEW_TARGET_TYPES,
} from "@/lib/reviews";

function buildMutualReviews(
  given: Array<{
    id: string;
    authorId: string;
    targetId: string;
    rating: number;
    comment: string | null;
    author: { id: string; name: string; photoUrl: string | null };
  }>,
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
      mutual.push({ partner: r.author, given: g, received: r });
    }
  }
  return mutual;
}

export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get("userId");
  const targetType = req.nextUrl.searchParams.get("targetType");
  const targetId = req.nextUrl.searchParams.get("targetId");
  const mutual = req.nextUrl.searchParams.get("mutual") === "1";
  const session = await getSession();
  const focusId = userId || session?.id;

  if (targetType && targetId) {
    const reviews = await prisma.review.findMany({
      where: {
        targetType,
        targetId,
        spamFlag: false,
      },
      include: { author: { select: { id: true, name: true, photoUrl: true } } },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return NextResponse.json({ reviews, targetTypes: REVIEW_TARGET_TYPES });
  }

  if (!focusId) {
    return NextResponse.json({ error: "userId required or sign in" }, { status: 400 });
  }

  const given = await prisma.review.findMany({
    where: { authorId: focusId },
    include: { author: { select: { id: true, name: true, photoUrl: true } } },
    orderBy: { createdAt: "desc" },
  });

  const received = await prisma.review.findMany({
    where: { targetId: focusId, spamFlag: false },
    include: { author: { select: { id: true, name: true, photoUrl: true } } },
    orderBy: { createdAt: "desc" },
  });

  const mutualReviews = mutual ? buildMutualReviews(given, received) : [];

  return NextResponse.json({
    given,
    received,
    mutualReviews,
    targetTypes: REVIEW_TARGET_TYPES,
  });
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    const body = await req.json();
    const targetType = String(body.targetType || "user").toLowerCase();
    const targetId = String(body.targetId || "");
    const rating = Number(body.rating);
    const comment = body.comment ? String(body.comment) : null;

    if (!targetId) return NextResponse.json({ error: "targetId required" }, { status: 400 });
    if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
      return NextResponse.json({ error: "rating must be 1–5" }, { status: 400 });
    }
    if (!REVIEW_TARGET_TYPES.includes(targetType as (typeof REVIEW_TARGET_TYPES)[number])) {
      return NextResponse.json({ error: "Invalid targetType" }, { status: 400 });
    }
    if (!allowedReviewPair(session.role, targetType)) {
      return NextResponse.json(
        { error: `${session.role} cannot review ${targetType}` },
        { status: 403 }
      );
    }

    const targetUserId = await resolveTargetUserId(targetType, targetId);
    const verified = await hasVerifiedRelationship(
      session.id,
      session.role,
      targetType,
      targetId,
      targetUserId
    );
    if (!verified && session.role !== "ADMIN" && session.role !== "DEVELOPER") {
      return NextResponse.json(
        { error: "Verified appointment/order required to review this target" },
        { status: 403 }
      );
    }

    const { fraudScore, spamFlag } = await scoreReviewFraud({
      authorId: session.id,
      comment,
      rating,
      targetId,
    });

    if (spamFlag && fraudScore >= 80) {
      return NextResponse.json(
        { error: "Review blocked by anti-spam / AI fraud detection", fraudScore },
        { status: 400 }
      );
    }

    const review = await prisma.review.create({
      data: {
        authorId: session.id,
        targetType,
        targetId: targetUserId && targetType !== "medicine" ? targetUserId : targetId,
        rating,
        comment,
        verified: true,
        fraudScore,
        spamFlag,
      },
      include: { author: { select: { id: true, name: true, photoUrl: true } } },
    });

    await audit(session.id, "review.create", "Review", review.id);
    return NextResponse.json({
      review,
      fraudScore,
      spamFlag,
      message: spamFlag
        ? "Review saved but flagged for moderation"
        : "Verified review submitted",
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error";
    const status = message === "UNAUTHORIZED" ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
