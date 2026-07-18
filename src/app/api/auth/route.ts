import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  buildSessionUser,
  createSessionToken,
  setSessionCookie,
  clearSessionCookie,
  getSession,
  audit,
} from "@/lib/auth";
import { defaultPermissionsForRole } from "@/lib/permissions";
import { redeemRegistrationCode } from "@/lib/subscriptions";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const action = body.action as string;

  try {
    if (action === "login") {
      const user = await prisma.user.findUnique({ where: { email: body.email } });
      if (!user || !user.active) {
        return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
      }
      if (!user.passwordHash) {
        return NextResponse.json(
          { error: "This account uses OAuth or biometric sign-in only" },
          { status: 401 }
        );
      }
      const ok = await bcrypt.compare(body.password, user.passwordHash);
      if (!ok) {
        return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
      }
      if (user.twoFactorEnabled && user.twoFactorSecret) {
        const { createPending2faToken } = await import("@/lib/twofactor-token");
        const pendingToken = await createPending2faToken(user.id);
        return NextResponse.json({
          requires2fa: true,
          pendingToken,
          message: "Enter your authenticator code",
        });
      }
      const sessionUser = await buildSessionUser(user.id);
      if (!sessionUser) {
        return NextResponse.json({ error: "Account inactive" }, { status: 401 });
      }
      const token = await createSessionToken(sessionUser);
      await setSessionCookie(token);
      await audit(user.id, "auth.login", "User");
      return NextResponse.json({ user: sessionUser });
    }

    if (action === "register") {
      const email = String(body.email).toLowerCase().trim();
      const existing = await prisma.user.findUnique({ where: { email } });
      if (existing && existing.active) {
        return NextResponse.json({ error: "Email already registered" }, { status: 400 });
      }

      const role = (body.role as Role) || Role.PATIENT;
      if (role === Role.DEVELOPER || role === Role.ADMIN) {
        return NextResponse.json({ error: "Cannot self-register as staff" }, { status: 403 });
      }

      const passwordHash = await bcrypt.hash(body.password, 10);
      let user;
      if (existing && !existing.active) {
        user = await prisma.user.update({
          where: { id: existing.id },
          data: {
            name: body.name,
            passwordHash,
            role,
            active: true,
            verified: false,
            photoUrl: body.photoUrl || existing.photoUrl,
          },
        });
      } else {
        user = await prisma.user.create({
          data: {
            email,
            name: body.name,
            passwordHash,
            role,
            active: true,
            photoUrl: body.photoUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(email)}`,
          },
        });
      }

      if (body.code) {
        await redeemRegistrationCode({ code: body.code, userId: user.id, email });
      }

      const perms = defaultPermissionsForRole(role);
      for (const key of perms) {
        const perm = await prisma.permission.findUnique({ where: { key } });
        if (perm) {
          await prisma.userPermission.upsert({
            where: { userId_permissionId: { userId: user.id, permissionId: perm.id } },
            update: { enabled: true },
            create: { userId: user.id, permissionId: perm.id, enabled: true },
          });
        }
      }

      if (role === Role.PATIENT) {
        await prisma.patientProfile.upsert({
          where: { userId: user.id },
          update: {},
          create: { userId: user.id },
        });
        await prisma.electronicHealthRecord.upsert({
          where: { userId: user.id },
          update: {},
          create: { userId: user.id },
        });
      }
      if (role === Role.DOCTOR) {
        await prisma.doctorProfile.upsert({
          where: { userId: user.id },
          update: {},
          create: { userId: user.id },
        });
      }
      if (role === Role.NURSE) {
        await prisma.nurseProfile.upsert({
          where: { userId: user.id },
          update: {},
          create: { userId: user.id },
        });
      }
      if (role === Role.HOSPITAL) {
        await prisma.hospitalProfile.upsert({
          where: { userId: user.id },
          update: {},
          create: { userId: user.id, name: body.name || "Hospital" },
        });
      }
      if (role === Role.PHARMACY) {
        await prisma.pharmacyProfile.upsert({
          where: { userId: user.id },
          update: {},
          create: { userId: user.id, name: body.name || "Pharmacy" },
        });
      }
      if (role === Role.COMPANY) {
        await prisma.companyProfile.upsert({
          where: { userId: user.id },
          update: {},
          create: { userId: user.id, name: body.name || "Company" },
        });
      }

      const sessionUser = await buildSessionUser(user.id);
      const token = await createSessionToken(sessionUser!);
      await setSessionCookie(token);
      await audit(user.id, "auth.register", "User");
      return NextResponse.json({ user: sessionUser });
    }

    if (action === "logout") {
      const session = await getSession();
      await clearSessionCookie();
      if (session) await audit(session.id, "auth.logout", "User");
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function GET() {
  const session = await getSession();
  return NextResponse.json({ user: session });
}
