import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  OAuthProvider,
  buildAuthorizeUrl,
  demoOAuthLogin,
  exchangeCode,
  oauthDemoAllowed,
  oauthEnabled,
  upsertOAuthUser,
  completeOAuthLogin,
} from "@/lib/oauth";
import { homePathForRole } from "@/lib/i18n";
import crypto from "crypto";

const STATE_COOKIE = "medcare_oauth_state";

export function makeOAuthHandlers(provider: OAuthProvider) {
  async function GET(req: NextRequest) {
    const url = new URL(req.url);
    const demo = url.searchParams.get("demo") === "1";

    if (demo || (!oauthEnabled(provider) && oauthDemoAllowed())) {
      if (!oauthDemoAllowed()) {
        return NextResponse.json(
          { error: `${provider} OAuth not configured`, enabled: false },
          { status: 503 }
        );
      }
      try {
        const user = await demoOAuthLogin(provider);
        return NextResponse.redirect(new URL(homePathForRole(user.role), req.url));
      } catch (e) {
        const message = e instanceof Error ? e.message : "OAuth demo failed";
        return NextResponse.json({ error: message }, { status: 400 });
      }
    }

    if (!oauthEnabled(provider)) {
      return NextResponse.json(
        { error: `${provider} OAuth not configured`, enabled: false },
        { status: 503 }
      );
    }

    const state = crypto.randomBytes(16).toString("hex");
    const jar = await cookies();
    jar.set(STATE_COOKIE, `${provider}:${state}`, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 600,
    });

    return NextResponse.redirect(buildAuthorizeUrl(provider, state));
  }

  async function handleCallback(req: NextRequest) {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const error = url.searchParams.get("error");

    if (error) {
      return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(error)}`, req.url));
    }
    if (!code) {
      return NextResponse.redirect(new URL("/login?error=missing_code", req.url));
    }

    const jar = await cookies();
    const stored = jar.get(STATE_COOKIE)?.value;
    jar.delete(STATE_COOKIE);
    if (state && stored && stored !== `${provider}:${state}`) {
      return NextResponse.redirect(new URL("/login?error=invalid_state", req.url));
    }

    try {
      const profile = await exchangeCode(provider, code);
      const user = await upsertOAuthUser(provider, profile);
      const session = await completeOAuthLogin(user.id);
      return NextResponse.redirect(new URL(homePathForRole(session.role), req.url));
    } catch (e) {
      const message = e instanceof Error ? e.message : "oauth_failed";
      return NextResponse.redirect(
        new URL(`/login?error=${encodeURIComponent(message)}`, req.url)
      );
    }
  }

  async function POST(req: NextRequest) {
    // Apple uses form_post
    const form = await req.formData();
    const code = String(form.get("code") || "");
    const state = String(form.get("state") || "");
    const error = String(form.get("error") || "");
    if (error) {
      return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(error)}`, req.url));
    }
    const synthetic = new NextRequest(
      `${req.nextUrl.origin}/api/auth/oauth/${provider}/callback?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`,
      { method: "GET" }
    );
    return handleCallback(synthetic);
  }

  return { GET, POST, handleCallback };
}
