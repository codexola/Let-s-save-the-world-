import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { Role } from "@prisma/client";
import { prisma } from "./db";
import { hasPermission, PermissionKey } from "./permissions";

const COOKIE = "medcare_session";

function secret() {
  return new TextEncoder().encode(
    process.env.JWT_SECRET || "medcare-dev-secret-change-in-production"
  );
}

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: Role;
  permissions: string[];
  photoUrl?: string | null;
  locale?: string;
};

export async function createSessionToken(user: SessionUser) {
  return new SignJWT({
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    permissions: user.permissions,
    photoUrl: user.photoUrl,
    locale: user.locale,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secret());
}

export async function setSessionCookie(token: string) {
  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
}

export async function clearSessionCookie() {
  const jar = await cookies();
  jar.delete(COOKIE);
}

export async function getSession(): Promise<SessionUser | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    return {
      id: payload.id as string,
      email: payload.email as string,
      name: payload.name as string,
      role: payload.role as Role,
      permissions: (payload.permissions as string[]) || [],
      photoUrl: (payload.photoUrl as string | null) ?? null,
      locale: (payload.locale as string) || "ja",
    };
  } catch {
    return null;
  }
}

export async function requireSession(): Promise<SessionUser> {
  const session = await getSession();
  if (!session) throw new Error("UNAUTHORIZED");
  return session;
}

export async function requirePermission(key: PermissionKey): Promise<SessionUser> {
  const session = await requireSession();
  if (!hasPermission(session.role, session.permissions, key)) {
    throw new Error("FORBIDDEN");
  }
  return session;
}

export async function loadUserPermissions(userId: string): Promise<string[]> {
  const rows = await prisma.userPermission.findMany({
    where: { userId, enabled: true },
    include: { permission: true },
  });
  return rows.map((r) => r.permission.key);
}

export async function buildSessionUser(userId: string): Promise<SessionUser | null> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.active) return null;
  const permissions = await loadUserPermissions(user.id);
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    permissions,
    photoUrl: user.photoUrl,
    locale: user.locale,
  };
}

export async function audit(
  userId: string | null | undefined,
  action: string,
  resource: string,
  details?: string,
  ip?: string | null
) {
  await prisma.auditLog.create({
    data: {
      userId: userId || undefined,
      action,
      resource,
      details,
      ip: ip || undefined,
    },
  });
}
