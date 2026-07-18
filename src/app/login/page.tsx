"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { PageShell } from "@/components/page-shell";
import { homePathForRole } from "@/lib/i18n";

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

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
          Demo: developer@ / admin@ / patient@ / doctor@ / nurse@ / hospital@ / company@medcare.local
        </p>
      </form>
    </PageShell>
  );
}
