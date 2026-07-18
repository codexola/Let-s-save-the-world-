import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
  const topic = req.nextUrl.searchParams.get("topic");
  const posts = await prisma.communityPost.findMany({
    where: topic ? { topic } : undefined,
    include: { author: { select: { id: true, name: true, photoUrl: true } } },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return NextResponse.json({ posts });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  if (body.action === "like") {
    const post = await prisma.communityPost.update({
      where: { id: body.postId },
      data: { likeCount: { increment: 1 } },
    });
    return NextResponse.json({ post });
  }

  const title = String(body.title || "").trim();
  const postBody = String(body.body || "").trim();
  if (!title || !postBody) {
    return NextResponse.json({ error: "Title and body required" }, { status: 400 });
  }

  const post = await prisma.communityPost.create({
    data: {
      authorId: session.id,
      title,
      body: postBody,
      topic: body.topic ? String(body.topic) : null,
    },
    include: { author: { select: { id: true, name: true, photoUrl: true } } },
  });

  return NextResponse.json({ post });
}
