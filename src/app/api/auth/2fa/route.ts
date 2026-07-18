import { NextRequest, NextResponse } from "next/server";
import {
  audit,
  buildSessionUser,
  createSessionToken,
  requireSession,
  setSessionCookie,
} from "@/lib/auth";
import { prisma } from "@/lib/db";
import { generateTwoFactorSecret, verifyTotp } from "@/lib/totp";
import { verifyPending2faToken } from "@/lib/twofactor-token";

export async function GET() {
  try {
    const session = await requireSession();
    const user = await prisma.user.findUnique({ where: { id: session.id } });
    return NextResponse.json({
      twoFactorEnabled: Boolean(user?.twoFactorEnabled),
      hasSecret: Boolean(user?.twoFactorSecret),
    });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const action = body.action as string;

  try {
    if (action === "setup") {
      const session = await requireSession();
      const { secret: totpSecret, otpauthUrl } = generateTwoFactorSecret(session.email);
      await prisma.user.update({
        where: { id: session.id },
        data: { twoFactorSecret: totpSecret, twoFactorEnabled: false },
      });
      await audit(session.id, "auth.2fa_setup", "User");
      return NextResponse.json({ secret: totpSecret, otpauthUrl });
    }

    if (action === "enable") {
      const session = await requireSession();
      const user = await prisma.user.findUnique({ where: { id: session.id } });
      if (!user?.twoFactorSecret) {
        return NextResponse.json({ error: "Run setup first" }, { status: 400 });
      }
      if (!verifyTotp(user.twoFactorSecret, String(body.token || ""))) {
        return NextResponse.json({ error: "Invalid authenticator code" }, { status: 400 });
      }
      await prisma.user.update({
        where: { id: session.id },
        data: { twoFactorEnabled: true },
      });
      await audit(session.id, "auth.2fa_enable", "User");
      return NextResponse.json({ ok: true, twoFactorEnabled: true });
    }

    if (action === "disable") {
      const session = await requireSession();
      const user = await prisma.user.findUnique({ where: { id: session.id } });
      if (user?.twoFactorEnabled && user.twoFactorSecret) {
        if (!verifyTotp(user.twoFactorSecret, String(body.token || ""))) {
          return NextResponse.json({ error: "Invalid authenticator code" }, { status: 400 });
        }
      }
      await prisma.user.update({
        where: { id: session.id },
        data: { twoFactorEnabled: false, twoFactorSecret: null },
      });
      await audit(session.id, "auth.2fa_disable", "User");
      return NextResponse.json({ ok: true, twoFactorEnabled: false });
    }

    if (action === "verify_login") {
      const userId = await verifyPending2faToken(String(body.pendingToken || ""));
      if (!userId) {
        return NextResponse.json({ error: "Expired 2FA challenge" }, { status: 401 });
      }
      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user?.twoFactorSecret || !user.twoFactorEnabled) {
        return NextResponse.json({ error: "2FA not enabled" }, { status: 400 });
      }
      if (!verifyTotp(user.twoFactorSecret, String(body.token || ""))) {
        return NextResponse.json({ error: "Invalid authenticator code" }, { status: 400 });
      }
      const sessionUser = await buildSessionUser(user.id);
      if (!sessionUser) {
        return NextResponse.json({ error: "Account inactive" }, { status: 401 });
      }
      const token = await createSessionToken(sessionUser);
      await setSessionCookie(token);
      await audit(user.id, "auth.login_2fa", "User");
      return NextResponse.json({ user: sessionUser });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error";
    const status = message === "UNAUTHORIZED" ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
