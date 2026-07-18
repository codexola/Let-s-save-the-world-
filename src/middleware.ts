import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";
import { rateLimit } from "@/lib/rate-limit";

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
  "/knowledge",
  "/education",
  "/faq",
  "/architecture",
  "/ems",
  "/laboratory",
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
  "/api/knowledge",
  "/api/cron",
  "/api/complaints",
  "/api/ems",
  "/api/laboratory",
  "/api/imaging",
  "/api/vaccination",
  "/api/insurance",
  "/api/education",
  "/api/social",
  "/api/v1",
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

function clientIp(req: NextRequest) {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

function securityHeaders(res: NextResponse) {
  // Zero Trust / hardening headers
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("X-Frame-Options", "DENY");
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  res.headers.set("Permissions-Policy", "camera=(self), microphone=(self), geolocation=(self)");
  res.headers.set("X-MedCare-ZeroTrust", "session-validated");
  if (process.env.NODE_ENV === "production") {
    res.headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
  }
  return res;
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

  // Rate limiting / DDoS soft protection (app layer)
  const ip = clientIp(req);
  const apiLimit = pathname.startsWith("/api/")
    ? rateLimit({ key: `api:${ip}`, limit: 120, windowMs: 60_000 })
    : rateLimit({ key: `page:${ip}`, limit: 300, windowMs: 60_000 });

  if (!apiLimit.ok) {
    const res = NextResponse.json(
      { error: "Too many requests — rate limit / DDoS protection", retryAfterMs: apiLimit.retryAfterMs },
      { status: 429 }
    );
    res.headers.set("Retry-After", String(Math.ceil(apiLimit.retryAfterMs / 1000)));
    return securityHeaders(res);
  }

  // Stricter auth endpoints
  if (pathname.startsWith("/api/auth") && req.method === "POST") {
    const authLimit = rateLimit({ key: `auth:${ip}`, limit: 30, windowMs: 60_000 });
    if (!authLimit.ok) {
      return securityHeaders(
        NextResponse.json({ error: "Auth rate limit exceeded" }, { status: 429 })
      );
    }
  }

  if (isPublicPath(pathname)) {
    if (pathname.startsWith("/api/blogs") && req.method === "POST") {
      const action = req.headers.get("x-action");
      if (action === "create" || action === "comment" || action === "reply") {
        return securityHeaders(await requireAuth(req));
      }
    }
    if (pathname.startsWith("/api/marketplace") && req.method === "POST") {
      return securityHeaders(await requireAuth(req));
    }
    if (pathname.startsWith("/api/community") && req.method === "POST") {
      return securityHeaders(await requireAuth(req));
    }
    if (pathname.startsWith("/api/knowledge") && req.method === "POST") {
      return securityHeaders(await requireAuth(req));
    }
    if (pathname.startsWith("/api/laboratory") && req.method === "POST") {
      return securityHeaders(await requireAuth(req));
    }
    if (pathname.startsWith("/api/imaging") && req.method === "POST") {
      return securityHeaders(await requireAuth(req));
    }
    if (pathname.startsWith("/api/vaccination") && req.method === "POST") {
      return securityHeaders(await requireAuth(req));
    }
    if (pathname.startsWith("/api/insurance") && req.method === "POST") {
      return securityHeaders(await requireAuth(req));
    }
    if (pathname.startsWith("/api/education") && req.method === "POST") {
      return securityHeaders(await requireAuth(req));
    }
    if (pathname.startsWith("/api/social") && req.method === "POST") {
      return securityHeaders(await requireAuth(req));
    }
    if (pathname.startsWith("/api/imaging") && req.method === "GET") {
      // Allow public secure-share token lookups; other imaging GETs still need session (checked in route)
      return securityHeaders(NextResponse.next());
    }
    if (pathname.startsWith("/api/vaccination") && req.method === "GET") {
      // Allow public digital certificate verification
      return securityHeaders(NextResponse.next());
    }
    if (pathname.startsWith("/api/insurance") && req.method === "GET") {
      // Allow public digital insurance card lookup
      return securityHeaders(NextResponse.next());
    }
    if (pathname.startsWith("/api/complaints") && req.method === "POST") {
      return securityHeaders(NextResponse.next()); // allow anonymous complaints
    }
    return securityHeaders(NextResponse.next());
  }

  return securityHeaders(await requireAuth(req));
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
