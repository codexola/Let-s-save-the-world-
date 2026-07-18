import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";

const COOKIE = "medcare_session";

const PUBLIC_PATHS = [
  "/",
  "/login",
  "/register",
  "/support",
  "/subscriptions",
  "/reviews",
  "/blog",
  "/profile",
  "/search",
  "/marketplace",
  "/community",
];

const PUBLIC_API = [
  "/api/auth",
  "/api/blogs",
  "/api/search",
  "/api/support",
  "/api/subscriptions",
  "/api/users",
  "/api/integrations",
  "/api/community",
  "/api/marketplace",
];

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return true;
  }
  if (PUBLIC_API.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return true;
  }
  return false;
}

function secret() {
  return new TextEncoder().encode(
    process.env.JWT_SECRET || "medcare-dev-secret-change-in-production"
  );
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  if (isPublicPath(pathname)) {
    if (pathname.startsWith("/api/blogs") && req.method === "POST") {
      const action = req.headers.get("x-action");
      if (action === "create" || action === "comment" || action === "reply") {
        return requireAuth(req);
      }
    }
    if (pathname.startsWith("/api/marketplace") && req.method === "POST") {
      return requireAuth(req);
    }
    if (pathname.startsWith("/api/community") && req.method === "POST") {
      return requireAuth(req);
    }
    return NextResponse.next();
  }

  return requireAuth(req);
}

async function requireAuth(req: NextRequest) {
  const token = req.cookies.get(COOKIE)?.value;
  if (!token) {
    if (req.nextUrl.pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/login", req.url));
  }

  try {
    await jwtVerify(token, secret());
    return NextResponse.next();
  } catch {
    if (req.nextUrl.pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/login", req.url));
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
