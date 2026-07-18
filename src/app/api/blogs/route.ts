import { NextRequest, NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { getSession, requireSession, audit } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getTopBlogPosts, updateArchiveBlogStats } from "@/lib/blog";

const BLOG_AUTHOR_ROLES: Role[] = [
  Role.DOCTOR,
  Role.HOSPITAL,
  Role.ADMIN,
  Role.DEVELOPER,
];

function canAuthorBlog(role: Role) {
  return BLOG_AUTHOR_ROLES.includes(role) || role === Role.NURSE;
}

export async function GET(req: NextRequest) {
  const top = req.nextUrl.searchParams.get("top");
  const limit = Number(req.nextUrl.searchParams.get("limit") || "10");
  const q = (req.nextUrl.searchParams.get("q") || "").trim();
  const tag = (req.nextUrl.searchParams.get("tag") || "").trim();
  const category = (req.nextUrl.searchParams.get("category") || "").trim();
  const authorRole = req.nextUrl.searchParams.get("authorRole");

  if (top === "1" || top === "true") {
    const posts = await getTopBlogPosts(Math.min(limit, 20));
    return NextResponse.json({ posts });
  }

  const session = await getSession();
  const bookmarksOnly = req.nextUrl.searchParams.get("bookmarks") === "1";

  if (bookmarksOnly && session) {
    const bookmarks = await prisma.blogBookmark.findMany({
      where: { userId: session.id },
      include: {
        post: {
          include: {
            author: { select: { id: true, name: true, photoUrl: true, role: true } },
            _count: { select: { comments: true, views: true, likes: true, bookmarks: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ posts: bookmarks.map((b) => b.post) });
  }

  const posts = await prisma.blogPost.findMany({
    where: {
      published: true,
      ...(q
        ? {
            OR: [
              { title: { contains: q } },
              { content: { contains: q } },
              { tags: { contains: q } },
              { category: { contains: q } },
            ],
          }
        : {}),
      ...(tag ? { tags: { contains: tag } } : {}),
      ...(category ? { category } : {}),
      ...(authorRole
        ? { author: { role: authorRole as Role } }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    take: Math.min(limit, 50),
    include: {
      author: { select: { id: true, name: true, photoUrl: true, role: true } },
      views: {
        take: 5,
        include: { viewer: { select: { id: true, name: true, photoUrl: true } } },
      },
      _count: { select: { comments: true, views: true, likes: true, bookmarks: true } },
      likes: session
        ? { where: { userId: session.id }, select: { id: true } }
        : false,
      bookmarks: session
        ? { where: { userId: session.id }, select: { id: true } }
        : false,
    },
  });

  return NextResponse.json({
    posts: posts.map((p) => ({
      ...p,
      likedByMe: Array.isArray(p.likes) ? p.likes.length > 0 : false,
      bookmarkedByMe: Array.isArray(p.bookmarks) ? p.bookmarks.length > 0 : false,
      likes: undefined,
      bookmarks: undefined,
    })),
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const action = body.action as string;

    if (action === "create") {
      const session = await requireSession();
      if (!canAuthorBlog(session.role)) {
        return NextResponse.json(
          { error: "Only doctors, hospitals, nurses, and researchers (staff) may publish" },
          { status: 403 }
        );
      }
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
          category: String(body.category || "medical_news"),
          published: Boolean(body.published ?? true),
        },
        include: { author: { select: { id: true, name: true, photoUrl: true, role: true } } },
      });

      await audit(session.id, "blog.create", "BlogPost", post.id);
      await updateArchiveBlogStats();
      return NextResponse.json({ post });
    }

    if (action === "like") {
      const session = await requireSession();
      const postId = String(body.postId);
      const existing = await prisma.blogLike.findUnique({
        where: { postId_userId: { postId, userId: session.id } },
      });
      if (existing) {
        await prisma.blogLike.delete({ where: { id: existing.id } });
        await prisma.blogPost.update({
          where: { id: postId },
          data: { likeCount: { decrement: 1 } },
        });
        return NextResponse.json({ liked: false });
      }
      await prisma.blogLike.create({ data: { postId, userId: session.id } });
      await prisma.blogPost.update({
        where: { id: postId },
        data: { likeCount: { increment: 1 } },
      });
      await audit(session.id, "blog.like", "BlogPost", postId);
      return NextResponse.json({ liked: true });
    }

    if (action === "bookmark") {
      const session = await requireSession();
      const postId = String(body.postId);
      const existing = await prisma.blogBookmark.findUnique({
        where: { postId_userId: { postId, userId: session.id } },
      });
      if (existing) {
        await prisma.blogBookmark.delete({ where: { id: existing.id } });
        return NextResponse.json({ bookmarked: false });
      }
      await prisma.blogBookmark.create({ data: { postId, userId: session.id } });
      await audit(session.id, "blog.bookmark", "BlogPost", postId);
      return NextResponse.json({ bookmarked: true });
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
          author: { select: { id: true, name: true, photoUrl: true, role: true } },
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
