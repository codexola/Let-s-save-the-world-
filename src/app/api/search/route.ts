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

  const nurses =
    type === "all" || type === "nurse"
      ? await prisma.nurseProfile.findMany({
          where: q
            ? {
                OR: [
                  { clinicalSpecialties: { contains: q } },
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
          include: {
            user: { select: { id: true, name: true, photoUrl: true } },
          },
          take: 20,
        })
      : [];

  const medicines =
    type === "all" || type === "medicine" || type === "medication"
      ? await prisma.medicine.findMany({
          where: q ? { name: { contains: q } } : undefined,
          include: { pharmacy: { select: { name: true } } },
          take: 20,
        })
      : [];

  const blogs =
    type === "all" || type === "blog" || type === "content"
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

  return NextResponse.json({
    doctors,
    nurses,
    hospitals,
    medicines,
    blogs,
    posts: blogs,
    platformReviews,
    query: q,
    type,
  });
}
