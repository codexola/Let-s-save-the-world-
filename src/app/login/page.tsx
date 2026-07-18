"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { startAuthentication } from "@simplewebauthn/browser";
import { PageShell } from "@/components/page-shell";
import { homePathForRole } from "@/lib/i18n";

type Integrations = {
  oauth?: {
    google?: boolean;
    apple?: boolean;
    microsoft?: boolean;
    line?: boolean;
    demoMode?: boolean;
    live?: Record<string, boolean>;
  };
};

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState(searchParams.get("error") || "");
  const [loading, setLoading] = useState(false);
  const [integrations, setIntegrations] = useState<Integrations | null>(null);
  const [pending2fa, setPending2fa] = useState<string | null>(null);
  const [totp, setTotp] = useState("");

  useEffect(() => {
    fetch("/api/integrations")
      .then((r) => r.json())
      .then(setIntegrations)
      .catch(() => setIntegrations(null));
  }, []);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const fd = new FormData(e.currentTarget);
    const res = await fetch("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "login",
        email: fd.get("email"),
        password: fd.get("password"),
      }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error || "Login failed");
      return;
    }
    if (data.requires2fa) {
      setPending2fa(data.pendingToken);
      return;
    }
    router.push(homePathForRole(data.user.role));
    router.refresh();
  }

  async function verify2fa(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const res = await fetch("/api/auth/2fa", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "verify_login",
        pendingToken: pending2fa,
        token: totp,
      }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error || "Invalid code");
      return;
    }
    router.push(homePathForRole(data.user.role));
    router.refresh();
  }

  async function biometricLogin() {
    setLoading(true);
    setError("");
    const email = (document.querySelector('input[name="email"]') as HTMLInputElement)?.value;
    if (!email) {
      setError("Enter your email first for biometric login");
      setLoading(false);
      return;
    }
    try {
      const optRes = await fetch("/api/auth/webauthn", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "login_options", email }),
      });
      const optData = await optRes.json();
      if (!optRes.ok) {
        setError(optData.error || "Biometric login unavailable");
        setLoading(false);
        return;
      }
      const assertion = await startAuthentication({ optionsJSON: optData.options });
      const verifyRes = await fetch("/api/auth/webauthn", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "login_verify", response: assertion }),
      });
      const verifyData = await verifyRes.json();
      setLoading(false);
      if (!verifyRes.ok) {
        setError(verifyData.error || "Biometric verification failed");
        return;
      }
      router.push(homePathForRole(verifyData.user.role));
      router.refresh();
    } catch (err) {
      setLoading(false);
      setError(err instanceof Error ? err.message : "Biometric cancelled");
    }
  }

  const oauth = integrations?.oauth;
  const providers: Array<{ key: "google" | "apple" | "microsoft" | "line"; label: string }> = [
    { key: "google", label: "Google" },
    { key: "apple", label: "Apple" },
    { key: "microsoft", label: "Microsoft" },
    { key: "line", label: "LINE" },
  ];

  if (pending2fa) {
    return (
      <PageShell eyebrow="Authentication" title="Two-factor authentication" description="Enter the code from your authenticator app.">
        <form className="panel form-narrow" onSubmit={verify2fa}>
          <label className="label">Authenticator code</label>
          <input
            className="input"
            value={totp}
            onChange={(e) => setTotp(e.target.value)}
            inputMode="numeric"
            autoComplete="one-time-code"
            required
            placeholder="123456"
          />
          {error && <p className="error-text">{error}</p>}
          <button className="btn btn-primary form-submit" disabled={loading} type="submit">
            {loading ? "Verifying…" : "Verify"}
          </button>
          <button className="btn btn-ghost" type="button" onClick={() => setPending2fa(null)}>
            Back
          </button>
        </form>
      </PageShell>
    );
  }

  return (
    <PageShell eyebrow="Authentication" title="Sign in" description="Email, OAuth, 2FA, and biometric login.">
      <form className="panel form-narrow" onSubmit={onSubmit}>
        <label className="label">Email</label>
        <input className="input" name="email" type="email" required defaultValue="patient@medcare.local" />
        <label className="label">Password</label>
        <input className="input" name="password" type="password" required defaultValue="Patient!2026" />
        {error && <p className="error-text">{error}</p>}
        <button className="btn btn-primary form-submit" disabled={loading} type="submit">
          {loading ? "Signing in…" : "Sign in"}
        </button>
        <button className="btn btn-ghost form-submit" type="button" disabled={loading} onClick={biometricLogin}>
          Biometric / passkey sign-in
        </button>
        <p className="muted hint-text">
          Demo: developer@ / admin@ / patient@ / doctor@ / nurse@ / hospital@ / company@ / pharmacy@medcare.local
        </p>
      </form>

      <div className="panel form-narrow" style={{ marginTop: "1rem" }}>
        <h2 style={{ marginTop: 0, fontSize: "1rem" }}>OAuth sign-in</h2>
        {oauth?.demoMode && !oauth.live?.google && (
          <p className="muted" style={{ fontSize: "0.85rem" }}>
            Demo OAuth enabled (no provider keys). Configure env keys for live OAuth.
          </p>
        )}
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
          {providers.map((p) => {
            const enabled = oauth?.[p.key];
            const live = oauth?.live?.[p.key];
            if (!enabled) {
              return (
                <button key={p.key} className="btn btn-ghost" type="button" disabled>
                  {p.label} — not configured
                </button>
              );
            }
            const href = live
              ? `/api/auth/oauth/${p.key}`
              : `/api/auth/oauth/${p.key}?demo=1`;
            return (
              <Link key={p.key} href={href} className="btn btn-ghost">
                Continue with {p.label}
                {!live ? " (demo)" : ""}
              </Link>
            );
          })}
        </div>
        <p className="muted hint-text" style={{ marginTop: "0.75rem" }}>
          Register a passkey under <Link href="/security">Security</Link> after signing in.
        </p>
      </div>
    </PageShell>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <PageShell eyebrow="Authentication" title="Sign in" description="Loading…">
          <p className="muted">Loading…</p>
        </PageShell>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
