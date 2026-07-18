import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await getSession();

  const post = await prisma.blogPost.findUnique({
    where: { id },
    include: {
      author: { select: { id: true, name: true, photoUrl: true, bio: true, role: true } },
      views: {
        take: 5,
        orderBy: { createdAt: "desc" },
        include: { viewer: { select: { id: true, name: true, photoUrl: true } } },
      },
      comments: {
        where: { parentId: null },
        orderBy: { createdAt: "desc" },
        include: {
          author: { select: { id: true, name: true, photoUrl: true } },
          replies: {
            orderBy: { createdAt: "asc" },
            include: { author: { select: { id: true, name: true, photoUrl: true } } },
          },
        },
      },
      likes: session ? { where: { userId: session.id }, select: { id: true } } : false,
      bookmarks: session ? { where: { userId: session.id }, select: { id: true } } : false,
      _count: { select: { likes: true, bookmarks: true, comments: true } },
    },
  });

  if (!post || (!post.published && post.authorId !== session?.id)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let mutualContext = null;
  if (session && session.id !== post.authorId) {
    const given = await prisma.review.findFirst({
      where: { authorId: session.id, targetId: post.authorId },
    });
    const received = await prisma.review.findFirst({
      where: { authorId: post.authorId, targetId: session.id },
    });
    if (given && received) {
      mutualContext = { given, received, mutual: true };
    }
  }

  return NextResponse.json({
    post: {
      ...post,
      likedByMe: Array.isArray(post.likes) ? post.likes.length > 0 : false,
      bookmarkedByMe: Array.isArray(post.bookmarks) ? post.bookmarks.length > 0 : false,
      likes: undefined,
      bookmarks: undefined,
    },
    mutualContext,
  });
}
