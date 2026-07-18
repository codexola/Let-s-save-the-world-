import { NextRequest, NextResponse } from "next/server";
import { getSession, requireSession, audit } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    const body = await req.json();

    if (body.action === "set_locale") {
      const locale = String(body.locale || "ja");
      await prisma.user.update({ where: { id: session.id }, data: { locale } });
      await audit(session.id, "profile.set_locale", "User", locale);
      const updated = await prisma.user.findUnique({ where: { id: session.id } });
      return NextResponse.json({ ok: true, locale: updated?.locale });
    }

    if (body.action === "update_profile") {
      const data: { name?: string; bio?: string; photoUrl?: string } = {};
      if (body.name) data.name = String(body.name);
      if (body.bio !== undefined) data.bio = String(body.bio);
      if (body.photoUrl) data.photoUrl = String(body.photoUrl);

      const user = await prisma.user.update({ where: { id: session.id }, data });
      await audit(session.id, "profile.update", "User");
      return NextResponse.json({
        user: {
          id: user.id,
          name: user.name,
          bio: user.bio,
          photoUrl: user.photoUrl,
          locale: user.locale,
        },
      });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error";
    const status = message === "UNAUTHORIZED" ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { id: session.id },
    select: { id: true, name: true, email: true, bio: true, photoUrl: true, locale: true, role: true },
  });
  return NextResponse.json({ user });
}
