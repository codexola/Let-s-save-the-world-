import { NextRequest, NextResponse } from "next/server";
import { getSession, requireSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  socialFeed,
  followUser,
  joinCommunity,
  createSocialPost,
  moderateFlag,
  isClinicianRole,
} from "@/lib/social";

export async function GET() {
  try {
    const session = await getSession();
    const feed = await socialFeed(session?.id);
    return NextResponse.json({
      ...feed,
      session: session
        ? { id: session.id, role: session.role, verified: true, isClinician: isClinicianRole(session.role) }
        : null,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    const body = await req.json();
    const action = body.action as string;

    if (action === "follow") {
      const follow = await followUser(session.id, String(body.targetId));
      return NextResponse.json({ follow });
    }

    if (action === "unfollow") {
      await prisma.socialFollow.deleteMany({
        where: { followerId: session.id, targetId: String(body.targetId) },
      });
      return NextResponse.json({ ok: true });
    }

    if (action === "join") {
      const membership = await joinCommunity(session.id, String(body.communityId));
      return NextResponse.json({ membership });
    }

    if (action === "post") {
      const post = await createSocialPost({
        authorId: session.id,
        title: String(body.title),
        body: String(body.body),
        postType: body.postType ? String(body.postType) : "discussion",
        communityId: body.communityId ? String(body.communityId) : undefined,
        topic: body.topic ? String(body.topic) : undefined,
      });
      return NextResponse.json({ post });
    }

    if (action === "like") {
      const post = await prisma.communityPost.update({
        where: { id: String(body.postId) },
        data: { likeCount: { increment: 1 } },
      });
      return NextResponse.json({ post });
    }

    if (action === "comment") {
      const comment = await prisma.communityComment.create({
        data: {
          postId: String(body.postId),
          authorId: session.id,
          body: String(body.body),
        },
      });
      return NextResponse.json({ comment });
    }

    if (action === "bookmark") {
      const bm = await prisma.communityBookmark.upsert({
        where: { postId_userId: { postId: String(body.postId), userId: session.id } },
        update: {},
        create: { postId: String(body.postId), userId: session.id },
      });
      return NextResponse.json({ bookmark: bm });
    }

    if (action === "qa_answer") {
      if (!isClinicianRole(session.role) && session.role !== "PATIENT") {
        return NextResponse.json({ error: "Sign in required" }, { status: 403 });
      }
      const answer = await prisma.qaAnswer.create({
        data: {
          postId: String(body.postId),
          authorId: session.id,
          body: String(body.body),
          accepted: false,
        },
      });
      return NextResponse.json({ answer });
    }

    if (action === "accept_answer") {
      const answer = await prisma.qaAnswer.update({
        where: { id: String(body.answerId) },
        data: { accepted: true },
      });
      return NextResponse.json({ answer });
    }

    if (action === "flag") {
      const flag = await prisma.moderationFlag.create({
        data: {
          postId: String(body.postId),
          reporterId: session.id,
          reason: String(body.reason || "Suspected health misinformation"),
          misinfo: Boolean(body.misinfo ?? true),
          status: "open",
        },
      });
      await prisma.communityPost.update({
        where: { id: String(body.postId) },
        data: { flagged: true },
      });
      return NextResponse.json({ flag });
    }

    if (action === "moderate") {
      if (!["ADMIN", "DEVELOPER", "DOCTOR", "HOSPITAL"].includes(session.role)) {
        return NextResponse.json({ error: "Moderator role required" }, { status: 403 });
      }
      const result = await moderateFlag(
        String(body.flagId),
        session.id,
        body.decision === "clear" ? "clear" : "remove"
      );
      return NextResponse.json(result);
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error";
    const status = message === "UNAUTHORIZED" ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
