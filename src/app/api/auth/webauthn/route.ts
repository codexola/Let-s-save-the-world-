import { NextRequest, NextResponse } from "next/server";
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from "@simplewebauthn/server";
import type {
  RegistrationResponseJSON,
  AuthenticationResponseJSON,
} from "@simplewebauthn/server";
import {
  audit,
  buildSessionUser,
  createSessionToken,
  requireSession,
  setSessionCookie,
} from "@/lib/auth";
import { prisma } from "@/lib/db";
import { config } from "@/lib/config";

function rpID() {
  try {
    return new URL(config.app.url).hostname;
  } catch {
    return "localhost";
  }
}

function origin() {
  return config.app.url.replace(/\/$/, "");
}

export async function GET() {
  try {
    const session = await requireSession();
    const creds = await prisma.webAuthnCredential.findMany({
      where: { userId: session.id },
      select: { id: true, nickname: true, deviceType: true, createdAt: true },
    });
    return NextResponse.json({ credentials: creds, rpID: rpID() });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const action = body.action as string;

  try {
    if (action === "register_options") {
      const session = await requireSession();
      const existing = await prisma.webAuthnCredential.findMany({
        where: { userId: session.id },
      });
      const options = await generateRegistrationOptions({
        rpName: "MedCare",
        rpID: rpID(),
        userName: session.email,
        userDisplayName: session.name,
        userID: new TextEncoder().encode(session.id),
        attestationType: "none",
        excludeCredentials: existing.map((c) => ({
          id: c.credentialId,
          transports: c.transports ? (JSON.parse(c.transports) as AuthenticatorTransport[]) : undefined,
        })),
        authenticatorSelection: {
          residentKey: "preferred",
          userVerification: "preferred",
          authenticatorAttachment: body.platformOnly ? "platform" : undefined,
        },
      });
      await prisma.authChallenge.create({
        data: {
          userId: session.id,
          type: "webauthn_register",
          challenge: options.challenge,
          expiresAt: new Date(Date.now() + 5 * 60 * 1000),
        },
      });
      return NextResponse.json({ options });
    }

    if (action === "register_verify") {
      const session = await requireSession();
      const challenge = await prisma.authChallenge.findFirst({
        where: {
          userId: session.id,
          type: "webauthn_register",
          consumed: false,
          expiresAt: { gt: new Date() },
        },
        orderBy: { createdAt: "desc" },
      });
      if (!challenge) {
        return NextResponse.json({ error: "Challenge expired" }, { status: 400 });
      }
      const verification = await verifyRegistrationResponse({
        response: body.response as RegistrationResponseJSON,
        expectedChallenge: challenge.challenge,
        expectedOrigin: origin(),
        expectedRPID: rpID(),
      });
      if (!verification.verified || !verification.registrationInfo) {
        return NextResponse.json({ error: "Registration failed" }, { status: 400 });
      }
      const { credential, credentialDeviceType } = verification.registrationInfo;
      await prisma.authChallenge.update({
        where: { id: challenge.id },
        data: { consumed: true },
      });
      await prisma.webAuthnCredential.create({
        data: {
          userId: session.id,
          credentialId: credential.id,
          publicKey: Buffer.from(credential.publicKey).toString("base64url"),
          counter: credential.counter,
          deviceType: credentialDeviceType,
          transports: credential.transports
            ? JSON.stringify(credential.transports)
            : null,
          nickname: body.nickname || "Biometric key",
        },
      });
      await audit(session.id, "auth.webauthn_register", "WebAuthnCredential");
      return NextResponse.json({ ok: true });
    }

    if (action === "login_options") {
      const email = String(body.email || "").toLowerCase().trim();
      const user = await prisma.user.findUnique({ where: { email } });
      if (!user) {
        return NextResponse.json({ error: "No biometric credentials for this account" }, { status: 404 });
      }
      const creds = await prisma.webAuthnCredential.findMany({ where: { userId: user.id } });
      if (creds.length === 0) {
        return NextResponse.json({ error: "No biometric credentials registered" }, { status: 404 });
      }
      const options = await generateAuthenticationOptions({
        rpID: rpID(),
        allowCredentials: creds.map((c) => ({
          id: c.credentialId,
          transports: c.transports
            ? (JSON.parse(c.transports) as AuthenticatorTransport[])
            : undefined,
        })),
        userVerification: "preferred",
      });
      await prisma.authChallenge.create({
        data: {
          userId: user.id,
          type: "webauthn_login",
          challenge: options.challenge,
          payload: user.id,
          expiresAt: new Date(Date.now() + 5 * 60 * 1000),
        },
      });
      return NextResponse.json({ options });
    }

    if (action === "login_verify") {
      const challenge = await prisma.authChallenge.findFirst({
        where: {
          type: "webauthn_login",
          consumed: false,
          expiresAt: { gt: new Date() },
        },
        orderBy: { createdAt: "desc" },
      });
      if (!challenge?.userId) {
        return NextResponse.json({ error: "Challenge expired" }, { status: 400 });
      }
      const response = body.response as AuthenticationResponseJSON;
      const cred = await prisma.webAuthnCredential.findUnique({
        where: { credentialId: response.id },
      });
      if (!cred || cred.userId !== challenge.userId) {
        return NextResponse.json({ error: "Unknown credential" }, { status: 400 });
      }
      const verification = await verifyAuthenticationResponse({
        response,
        expectedChallenge: challenge.challenge,
        expectedOrigin: origin(),
        expectedRPID: rpID(),
        credential: {
          id: cred.credentialId,
          publicKey: Buffer.from(cred.publicKey, "base64url"),
          counter: cred.counter,
          transports: cred.transports
            ? (JSON.parse(cred.transports) as AuthenticatorTransport[])
            : undefined,
        },
      });
      if (!verification.verified) {
        return NextResponse.json({ error: "Biometric verification failed" }, { status: 401 });
      }
      await prisma.authChallenge.update({
        where: { id: challenge.id },
        data: { consumed: true },
      });
      await prisma.webAuthnCredential.update({
        where: { id: cred.id },
        data: { counter: verification.authenticationInfo.newCounter },
      });
      const sessionUser = await buildSessionUser(challenge.userId);
      if (!sessionUser) {
        return NextResponse.json({ error: "Account inactive" }, { status: 401 });
      }
      const token = await createSessionToken(sessionUser);
      await setSessionCookie(token);
      await audit(challenge.userId, "auth.webauthn_login", "User");
      return NextResponse.json({ user: sessionUser });
    }

    if (action === "delete") {
      const session = await requireSession();
      await prisma.webAuthnCredential.deleteMany({
        where: { id: body.credentialId, userId: session.id },
      });
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error";
    const status = message === "UNAUTHORIZED" ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
