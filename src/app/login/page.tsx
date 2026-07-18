"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { PageShell } from "@/components/page-shell";
import { homePathForRole } from "@/lib/i18n";

type Integrations = {
  oauth?: { google?: boolean; apple?: boolean; microsoft?: boolean; line?: boolean };
};

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [integrations, setIntegrations] = useState<Integrations | null>(null);

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
    router.push(homePathForRole(data.user.role));
    router.refresh();
  }

  const googleEnabled = integrations?.oauth?.google;

  return (
    <PageShell eyebrow="Authentication" title="Sign in" description="Sign in to your role dashboard.">
      <form className="panel form-narrow" onSubmit={onSubmit}>
        <label className="label">Email</label>
        <input className="input" name="email" type="email" required defaultValue="patient@medcare.local" />
        <label className="label">Password</label>
        <input className="input" name="password" type="password" required defaultValue="Patient!2026" />
        {error && <p className="error-text">{error}</p>}
        <button className="btn btn-primary form-submit" disabled={loading} type="submit">
          {loading ? "Signing in…" : "Sign in"}
        </button>
        <p className="muted hint-text">
          Demo: developer@ / admin@ / patient@ / doctor@ / nurse@ / hospital@ / company@ / pharmacy@medcare.local
        </p>
      </form>

      <div className="panel form-narrow" style={{ marginTop: "1rem" }}>
        <h2 style={{ marginTop: 0, fontSize: "1rem" }}>OAuth sign-in</h2>
        {googleEnabled ? (
          <Link href="/api/auth/oauth/google" className="btn btn-ghost">
            Continue with Google
          </Link>
        ) : (
          <button className="btn btn-ghost" type="button" disabled title="Configure GOOGLE_CLIENT_ID">
            Google — Configure GOOGLE_CLIENT_ID
          </button>
        )}
        <button className="btn btn-ghost" type="button" disabled style={{ marginLeft: "0.5rem" }}>
          Apple — not configured
        </button>
        <button className="btn btn-ghost" type="button" disabled style={{ marginLeft: "0.5rem" }}>
          Microsoft — not configured
        </button>
      </div>
    </PageShell>
  );
}
