import { prisma } from "./db";

export type BlogStatsPayload = {
  totalViews: number;
  totalSubscribers: number;
  postStats: Record<string, { views: number; uniqueViewers: number }>;
  updatedAt: string;
};

export async function updateArchiveBlogStats() {
  const posts = await prisma.blogPost.findMany({
    select: { id: true, viewCount: true, _count: { select: { views: true } } },
  });

  const activeSubs = await prisma.subscription.count({
    where: { status: { in: ["ACTIVE", "ADMIN_GRANTED"] } },
  });

  const postStats: BlogStatsPayload["postStats"] = {};
  let totalViews = 0;
  for (const p of posts) {
    postStats[p.id] = { views: p.viewCount, uniqueViewers: p._count.views };
    totalViews += p.viewCount;
  }

  const blogStats: BlogStatsPayload = {
    totalViews,
    totalSubscribers: activeSubs,
    postStats,
    updatedAt: new Date().toISOString(),
  };

  const archive = await prisma.archive.findFirst({ orderBy: { updatedAt: "desc" } });
  if (!archive) return blogStats;

  let payload: Record<string, unknown> = {};
  try {
    payload = JSON.parse(archive.payload) as Record<string, unknown>;
  } catch {
    payload = {};
  }

  payload.blogStats = blogStats;

  await prisma.archive.update({
    where: { id: archive.id },
    data: {
      payload: JSON.stringify(payload),
      version: archive.version + 1,
    },
  });

  return blogStats;
}

export async function getTopBlogPosts(limit = 5) {
  return prisma.blogPost.findMany({
    where: { published: true },
    orderBy: [{ viewCount: "desc" }, { likeCount: "desc" }],
    take: limit,
    include: {
      author: { select: { id: true, name: true, photoUrl: true } },
      views: {
        take: 5,
        orderBy: { createdAt: "desc" },
        include: { viewer: { select: { id: true, name: true, photoUrl: true } } },
      },
    },
  });
}
