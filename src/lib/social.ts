import { prisma } from "./db";
import { audit } from "./auth";
import { notifyUser } from "./notify";

export async function ensureSocialSeed() {
  if ((await prisma.diseaseCommunity.count()) > 0) return;
  const communities = [
    { name: "Hypertension Support", disease: "Hypertension", description: "BP tips, med adherence, peer support." },
    { name: "Diabetes Living Well", disease: "Diabetes", description: "Glucose, nutrition, and recovery stories." },
    { name: "Cancer Survivors Circle", disease: "Cancer", description: "Moderated recovery stories and Q&A." },
    { name: "Mental Health Allies", disease: "Mental Health", description: "Peer support with clinician visibility." },
  ];
  for (const c of communities) {
    await prisma.diseaseCommunity.create({ data: { ...c, moderated: true } });
  }
}

export function isClinicianRole(role: string) {
  return ["DOCTOR", "NURSE", "HOSPITAL", "RESEARCHER", "ADMIN", "DEVELOPER"].includes(role);
}

export async function socialFeed(userId?: string) {
  await ensureSocialSeed();
  const posts = await prisma.communityPost.findMany({
    where: { status: "published" },
    include: {
      author: { select: { id: true, name: true, role: true, verified: true, photoUrl: true } },
      community: true,
      comments: {
        include: { author: { select: { id: true, name: true, role: true, verified: true } } },
        orderBy: { createdAt: "asc" },
        take: 20,
      },
      qaAnswers: {
        include: { author: { select: { id: true, name: true, role: true, verified: true } } },
        orderBy: { createdAt: "asc" },
      },
      _count: { select: { bookmarks: true, flags: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 60,
  });

  const communities = await prisma.diseaseCommunity.findMany({
    include: { _count: { select: { members: true, posts: true } } },
  });

  let following: string[] = [];
  let bookmarks: string[] = [];
  if (userId) {
    following = (
      await prisma.socialFollow.findMany({ where: { followerId: userId }, select: { targetId: true } })
    ).map((f) => f.targetId);
    bookmarks = (
      await prisma.communityBookmark.findMany({ where: { userId }, select: { postId: true } })
    ).map((b) => b.postId);
  }

  const followTargets = await prisma.user.findMany({
    where: { role: { in: ["DOCTOR", "HOSPITAL", "RESEARCHER"] }, active: true },
    select: { id: true, name: true, role: true, verified: true, photoUrl: true },
    take: 30,
  });

  const openFlags = await prisma.moderationFlag.findMany({
    where: { status: "open" },
    include: { post: { select: { id: true, title: true } }, reporter: { select: { name: true } } },
    take: 20,
    orderBy: { createdAt: "desc" },
  });

  return { posts, communities, followTargets, following, bookmarks, openFlags };
}

export async function followUser(followerId: string, targetId: string) {
  if (followerId === targetId) throw new Error("Cannot follow yourself");
  const follow = await prisma.socialFollow.upsert({
    where: { followerId_targetId: { followerId, targetId } },
    update: {},
    create: { followerId, targetId },
  });
  await notifyUser({
    userId: targetId,
    subject: "New follower on MedCare",
    body: "Someone followed your professional profile.",
    kind: "general",
    channels: ["push", "inbox"],
  }).catch(() => undefined);
  return follow;
}

export async function joinCommunity(userId: string, communityId: string) {
  return prisma.communityMembership.upsert({
    where: { userId_communityId: { userId, communityId } },
    update: {},
    create: { userId, communityId },
  });
}

export async function createSocialPost(opts: {
  authorId: string;
  title: string;
  body: string;
  postType?: string;
  communityId?: string;
  topic?: string;
}) {
  // Simple misinfo keyword screen
  const misinfoHit = /miracle cure|bleach|anti-vax mandate hoax|guaranteed cure/i.test(
    `${opts.title} ${opts.body}`
  );
  const post = await prisma.communityPost.create({
    data: {
      authorId: opts.authorId,
      title: opts.title,
      body: opts.body,
      postType: opts.postType || "discussion",
      communityId: opts.communityId,
      topic: opts.topic,
      status: misinfoHit ? "held" : "published",
      flagged: misinfoHit,
      moderated: false,
    },
  });
  if (misinfoHit) {
    await prisma.moderationFlag.create({
      data: {
        postId: post.id,
        reporterId: opts.authorId,
        reason: "Automated misinformation screen",
        misinfo: true,
        status: "open",
      },
    });
  }
  return post;
}

export async function moderateFlag(flagId: string, actorId: string, action: "remove" | "clear") {
  const flag = await prisma.moderationFlag.findUnique({ where: { id: flagId } });
  if (!flag) throw new Error("Flag not found");
  if (action === "remove") {
    await prisma.communityPost.update({
      where: { id: flag.postId },
      data: { status: "removed", moderated: true, flagged: true },
    });
  } else {
    await prisma.communityPost.update({
      where: { id: flag.postId },
      data: { status: "published", flagged: false, moderated: true },
    });
  }
  await prisma.moderationFlag.update({
    where: { id: flagId },
    data: { status: action === "remove" ? "removed" : "cleared" },
  });
  await audit(actorId, `social.moderate.${action}`, "ModerationFlag", flagId);
  return { ok: true };
}
