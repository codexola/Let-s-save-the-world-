import { SignJWT, importPKCS8 } from "jose";
import { Role } from "@prisma/client";
import bcrypt from "bcryptjs";
import { prisma } from "./db";
import { config } from "./config";
import { buildSessionUser, createSessionToken, setSessionCookie, audit } from "./auth";
import { defaultPermissionsForRole } from "./permissions";

export type OAuthProvider = "google" | "apple" | "microsoft" | "line";

export function oauthEnabled(provider: OAuthProvider): boolean {
  return Boolean(config.oauth[provider].enabled);
}

/** Demo OAuth is always available so local/dev works without real keys */
export function oauthDemoAllowed(): boolean {
  return config.oauth.demoMode;
}

export function oauthCallbackUrl(provider: OAuthProvider): string {
  return `${config.app.url}/api/auth/oauth/${provider}/callback`;
}

export async function createAppleClientSecret(): Promise<string> {
  const { clientId, teamId, keyId, privateKey } = config.oauth.apple;
  if (!clientId || !teamId || !keyId || !privateKey) {
    throw new Error("Apple OAuth not fully configured");
  }
  const key = await importPKCS8(privateKey.replace(/\\n/g, "\n"), "ES256");
  return new SignJWT({})
    .setProtectedHeader({ alg: "ES256", kid: keyId })
    .setIssuer(teamId)
    .setIssuedAt()
    .setExpirationTime("1h")
    .setAudience("https://appleid.apple.com")
    .setSubject(clientId)
    .sign(key);
}

export function buildAuthorizeUrl(provider: OAuthProvider, state: string): string {
  const redirectUri = oauthCallbackUrl(provider);
  if (provider === "google") {
    const params = new URLSearchParams({
      client_id: config.oauth.google.clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: "openid email profile",
      state,
      access_type: "offline",
      prompt: "select_account",
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
  }
  if (provider === "apple") {
    const params = new URLSearchParams({
      client_id: config.oauth.apple.clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: "name email",
      response_mode: "form_post",
      state,
    });
    return `https://appleid.apple.com/auth/authorize?${params}`;
  }
  if (provider === "microsoft") {
    const tenant = config.oauth.microsoft.tenant;
    const params = new URLSearchParams({
      client_id: config.oauth.microsoft.clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: "openid email profile User.Read",
      state,
    });
    return `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize?${params}`;
  }
  const params = new URLSearchParams({
    response_type: "code",
    client_id: config.oauth.line.channelId,
    redirect_uri: redirectUri,
    state,
    scope: "profile openid email",
  });
  return `https://access.line.me/oauth2/v2.1/authorize?${params}`;
}

type TokenProfile = {
  subject: string;
  email: string;
  name: string;
  photoUrl?: string;
};

export async function exchangeCode(
  provider: OAuthProvider,
  code: string
): Promise<TokenProfile> {
  const redirectUri = oauthCallbackUrl(provider);

  if (provider === "google") {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: config.oauth.google.clientId,
        client_secret: config.oauth.google.clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });
    if (!tokenRes.ok) throw new Error("Google token exchange failed");
    const tokens = (await tokenRes.json()) as { access_token: string };
    const profileRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    if (!profileRes.ok) throw new Error("Google profile fetch failed");
    const p = (await profileRes.json()) as {
      sub: string;
      email: string;
      name?: string;
      picture?: string;
    };
    return {
      subject: p.sub,
      email: p.email.toLowerCase(),
      name: p.name || p.email.split("@")[0],
      photoUrl: p.picture,
    };
  }

  if (provider === "apple") {
    const clientSecret = await createAppleClientSecret();
    const tokenRes = await fetch("https://appleid.apple.com/auth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: config.oauth.apple.clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });
    if (!tokenRes.ok) throw new Error("Apple token exchange failed");
    const tokens = (await tokenRes.json()) as { id_token?: string };
    if (!tokens.id_token) throw new Error("Apple id_token missing");
    const payload = JSON.parse(
      Buffer.from(tokens.id_token.split(".")[1], "base64url").toString("utf8")
    ) as { sub: string; email?: string };
    return {
      subject: payload.sub,
      email: (payload.email || `${payload.sub}@privaterelay.appleid.com`).toLowerCase(),
      name: payload.email?.split("@")[0] || "Apple User",
    };
  }

  if (provider === "microsoft") {
    const tenant = config.oauth.microsoft.tenant;
    const tokenRes = await fetch(
      `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: config.oauth.microsoft.clientId,
          client_secret: config.oauth.microsoft.clientSecret,
          redirect_uri: redirectUri,
          grant_type: "authorization_code",
        }),
      }
    );
    if (!tokenRes.ok) throw new Error("Microsoft token exchange failed");
    const tokens = (await tokenRes.json()) as { access_token: string };
    const profileRes = await fetch("https://graph.microsoft.com/v1.0/me", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    if (!profileRes.ok) throw new Error("Microsoft profile fetch failed");
    const p = (await profileRes.json()) as {
      id: string;
      mail?: string;
      userPrincipalName?: string;
      displayName?: string;
    };
    const email = (p.mail || p.userPrincipalName || `${p.id}@microsoft.local`).toLowerCase();
    return {
      subject: p.id,
      email,
      name: p.displayName || email.split("@")[0],
    };
  }

  const tokenRes = await fetch("https://api.line.me/oauth2/v2.1/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id: config.oauth.line.channelId,
      client_secret: config.oauth.line.channelSecret,
    }),
  });
  if (!tokenRes.ok) throw new Error("LINE token exchange failed");
  const tokens = (await tokenRes.json()) as { access_token: string; id_token?: string };
  const profileRes = await fetch("https://api.line.me/v2/profile", {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  if (!profileRes.ok) throw new Error("LINE profile fetch failed");
  const p = (await profileRes.json()) as {
    userId: string;
    displayName: string;
    pictureUrl?: string;
  };
  let email = `${p.userId}@line.local`;
  if (tokens.id_token) {
    try {
      const payload = JSON.parse(
        Buffer.from(tokens.id_token.split(".")[1], "base64url").toString("utf8")
      ) as { email?: string };
      if (payload.email) email = payload.email.toLowerCase();
    } catch {
      /* keep fallback */
    }
  }
  return {
    subject: p.userId,
    email,
    name: p.displayName,
    photoUrl: p.pictureUrl,
  };
}

export async function upsertOAuthUser(
  provider: OAuthProvider,
  profile: TokenProfile
): Promise<{ id: string }> {
  const existingLink = await prisma.oAuthAccount.findUnique({
    where: {
      provider_providerSubject: { provider, providerSubject: profile.subject },
    },
  });
  if (existingLink) {
    await prisma.user.update({
      where: { id: existingLink.userId },
      data: {
        name: profile.name,
        photoUrl: profile.photoUrl || undefined,
        verified: true,
      },
    });
    return { id: existingLink.userId };
  }

  let user = await prisma.user.findUnique({ where: { email: profile.email } });
  if (!user) {
    const randomHash = await bcrypt.hash(`oauth-${provider}-${profile.subject}-${Date.now()}`, 10);
    user = await prisma.user.create({
      data: {
        email: profile.email,
        name: profile.name,
        passwordHash: randomHash,
        role: Role.PATIENT,
        photoUrl:
          profile.photoUrl ||
          `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(profile.email)}`,
        verified: true,
        active: true,
      },
    });
    await prisma.patientProfile.create({ data: { userId: user.id } });
    await prisma.electronicHealthRecord.create({ data: { userId: user.id } });
    const perms = defaultPermissionsForRole(Role.PATIENT);
    for (const key of perms) {
      const perm = await prisma.permission.findUnique({ where: { key } });
      if (perm) {
        await prisma.userPermission.create({
          data: { userId: user.id, permissionId: perm.id, enabled: true },
        });
      }
    }
  }

  await prisma.oAuthAccount.create({
    data: {
      userId: user.id,
      provider,
      providerSubject: profile.subject,
      email: profile.email,
    },
  });

  return { id: user.id };
}

export async function completeOAuthLogin(userId: string) {
  const sessionUser = await buildSessionUser(userId);
  if (!sessionUser) throw new Error("Account inactive");
  const token = await createSessionToken(sessionUser);
  await setSessionCookie(token);
  await audit(userId, "auth.oauth_login", "User");
  return sessionUser;
}

export async function demoOAuthLogin(provider: OAuthProvider) {
  const email = `oauth.${provider}@medcare.local`;
  const subject = `demo-${provider}-subject`;
  const user = await upsertOAuthUser(provider, {
    subject,
    email,
    name: `${provider.charAt(0).toUpperCase()}${provider.slice(1)} User`,
    photoUrl: `https://api.dicebear.com/7.x/avataaars/svg?seed=${provider}`,
  });
  return completeOAuthLogin(user.id);
}
