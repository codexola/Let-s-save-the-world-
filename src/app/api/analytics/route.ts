import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const archive = await prisma.archive.findFirst({ orderBy: { updatedAt: "desc" } });
  let blogStats = null;
  if (archive) {
    try {
      const payload = JSON.parse(archive.payload) as { blogStats?: unknown };
      blogStats = payload.blogStats ?? null;
    } catch {
      blogStats = null;
    }
  }

  const [
    users,
    appointments,
    subscriptions,
    consultations,
    emergencies,
    featuresOn,
    platformReviews,
    blogPosts,
    prescriptions,
    invoicesOpen,
    telemedicineSessions,
    communityPosts,
    medicines,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.appointment.count(),
    prisma.subscription.count({ where: { status: { in: ["ACTIVE", "ADMIN_GRANTED"] } } }),
    prisma.aiConsultation.count(),
    prisma.emergencyRequest.count(),
    prisma.featureFlag.count({ where: { enabled: true } }),
    prisma.platformReview.findMany({ take: 5, orderBy: { createdAt: "desc" } }),
    prisma.blogPost.count({ where: { published: true } }),
    prisma.prescription.count(),
    prisma.invoice.count({ where: { status: "OPEN" } }),
    prisma.telemedicineSession.count(),
    prisma.communityPost.count(),
    prisma.medicine.count(),
  ]);

  return NextResponse.json({
    stats: {
      users,
      appointments,
      activeSubscriptions: subscriptions,
      aiConsultations: consultations,
      emergencies,
      featuresEnabled: featuresOn,
      publishedBlogPosts: blogPosts,
      prescriptions,
      openInvoices: invoicesOpen,
      telemedicineSessions,
      communityPosts,
      medicinesListed: medicines,
      blogStats,
    },
    platformReviews,
  });
}
