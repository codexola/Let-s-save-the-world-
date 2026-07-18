import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") || "").trim();
  const type = req.nextUrl.searchParams.get("type") || "all";

  const doctors =
    type === "all" || type === "doctor"
      ? await prisma.doctorProfile.findMany({
          where: q
            ? {
                OR: [
                  { specialty: { contains: q } },
                  { subspecialty: { contains: q } },
                  { user: { name: { contains: q } } },
                ],
              }
            : undefined,
          include: {
            user: { select: { id: true, name: true, email: true, photoUrl: true } },
          },
          take: 20,
        })
      : [];

  const hospitals =
    type === "all" || type === "hospital"
      ? await prisma.hospitalProfile.findMany({
          where: q
            ? {
                OR: [{ name: { contains: q } }, { departments: { contains: q } }],
              }
            : undefined,
          take: 20,
        })
      : [];

  const medicines =
    type === "all" || type === "medication"
      ? await prisma.medicine.findMany({
          where: q ? { name: { contains: q } } : undefined,
          take: 20,
        })
      : [];

  const posts =
    type === "all" || type === "content"
      ? await prisma.blogPost.findMany({
          where: q
            ? {
                published: true,
                OR: [
                  { title: { contains: q } },
                  { content: { contains: q } },
                  { tags: { contains: q } },
                ],
              }
            : { published: true },
          include: { author: { select: { id: true, name: true, photoUrl: true } } },
          take: 20,
        })
      : [];

  const platformReviews = await prisma.platformReview.findMany({
    include: { author: { select: { id: true, name: true, photoUrl: true } } },
    orderBy: { rating: "desc" },
    take: 10,
  });

  return NextResponse.json({ doctors, hospitals, medicines, posts, platformReviews, query: q });
}
