import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
  const session = await getSession();
  const email = req.nextUrl.searchParams.get("email") || session?.email;
  if (!email && !session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const isStaff = session?.role === "ADMIN" || session?.role === "DEVELOPER";
  const notifications = await prisma.notification.findMany({
    where:
      isStaff && !req.nextUrl.searchParams.get("email")
        ? undefined
        : { email: email || undefined },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return NextResponse.json({ notifications });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  if (body.action === "mark_read") {
    await prisma.notification.update({
      where: { id: body.id },
      data: { read: true },
    });
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
