import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await getSession();

  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      email: true,
      photoUrl: true,
      bio: true,
      role: true,
      doctorProfile: true,
      hospitalProfile: true,
      patientProfile: true,
    },
  });

  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const given = await prisma.review.findMany({
    where: { authorId: id },
    include: { author: { select: { id: true, name: true, photoUrl: true } } },
    orderBy: { createdAt: "desc" },
  });

  const received = await prisma.review.findMany({
    where: { targetId: id },
    include: { author: { select: { id: true, name: true, photoUrl: true } } },
    orderBy: { createdAt: "desc" },
  });

  const mutualReviews: Array<{
    partner: { id: string; name: string; photoUrl: string | null };
    given: (typeof given)[0];
    received: (typeof received)[0];
  }> = [];

  if (session) {
    for (const g of given) {
      const r = received.find((x) => x.authorId === g.targetId);
      if (r) {
        mutualReviews.push({
          partner: r.author,
          given: g,
          received: r,
        });
      }
    }
  }

  return NextResponse.json({ user, given, received, mutualReviews });
}
