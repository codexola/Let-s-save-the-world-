import { NextRequest, NextResponse } from "next/server";
import { getSession, requireSession, audit } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getTopBlogPosts, updateArchiveBlogStats } from "@/lib/blog";

export async function GET(req: NextRequest) {
  const top = req.nextUrl.searchParams.get("top");
  const limit = Number(req.nextUrl.searchParams.get("limit") || "10");

  if (top === "1" || top === "true") {
    const posts = await getTopBlogPosts(Math.min(limit, 20));
    return NextResponse.json({ posts });
  }

  const posts = await prisma.blogPost.findMany({
    where: { published: true },
    orderBy: { createdAt: "desc" },
    take: Math.min(limit, 50),
    include: {
      author: { select: { id: true, name: true, photoUrl: true } },
      views: {
        take: 5,
        include: { viewer: { select: { id: true, name: true, photoUrl: true } } },
      },
      _count: { select: { comments: true, views: true } },
    },
  });

  return NextResponse.json({ posts });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const action = body.action as string;

    if (action === "create") {
      const session = await requireSession();
      const coverImage = String(body.coverImage || "").trim();
      if (!coverImage) {
        return NextResponse.json(
          { error: "coverImage is required — every article must include a photo" },
          { status: 400 }
        );
      }

      const post = await prisma.blogPost.create({
        data: {
          authorId: session.id,
          title: String(body.title),
          content: String(body.content),
          coverImage,
          tags: body.tags ? String(body.tags) : null,
          published: Boolean(body.published ?? true),
        },
        include: { author: { select: { id: true, name: true, photoUrl: true } } },
      });

      await audit(session.id, "blog.create", "BlogPost", post.id);
      await updateArchiveBlogStats();
      return NextResponse.json({ post });
    }

    if (action === "comment") {
      const session = await requireSession();
      const comment = await prisma.blogComment.create({
        data: {
          postId: body.postId,
          authorId: session.id,
          body: String(body.body),
          rating: body.rating ? Number(body.rating) : null,
        },
        include: { author: { select: { id: true, name: true, photoUrl: true } } },
      });
      await audit(session.id, "blog.comment", "BlogComment", comment.id);
      return NextResponse.json({ comment });
    }

    if (action === "reply") {
      const session = await requireSession();
      const parent = await prisma.blogComment.findUnique({ where: { id: body.parentId } });
      if (!parent) return NextResponse.json({ error: "Parent comment not found" }, { status: 404 });

      const reply = await prisma.blogComment.create({
        data: {
          postId: parent.postId,
          authorId: session.id,
          body: String(body.body),
          parentId: parent.id,
          rating: body.rating ? Number(body.rating) : null,
        },
        include: { author: { select: { id: true, name: true, photoUrl: true } } },
      });
      await audit(session.id, "blog.reply", "BlogComment", reply.id);
      return NextResponse.json({ comment: reply });
    }

    if (action === "record_view") {
      const postId = String(body.postId);
      const session = await getSession();

      const post = await prisma.blogPost.findUnique({ where: { id: postId } });
      if (!post || !post.published) {
        return NextResponse.json({ error: "Post not found" }, { status: 404 });
      }

      if (session) {
        await prisma.blogView.upsert({
          where: { postId_viewerId: { postId, viewerId: session.id } },
          update: {},
          create: { postId, viewerId: session.id },
        });
      }

      const updated = await prisma.blogPost.update({
        where: { id: postId },
        data: { viewCount: { increment: 1 } },
        include: {
          author: { select: { id: true, name: true, photoUrl: true } },
          views: {
            take: 5,
            orderBy: { createdAt: "desc" },
            include: { viewer: { select: { id: true, name: true, photoUrl: true } } },
          },
        },
      });

      const blogStats = await updateArchiveBlogStats();
      return NextResponse.json({ post: updated, blogStats });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error";
    const status = message === "UNAUTHORIZED" ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
