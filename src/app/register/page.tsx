"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { PageShell } from "@/components/page-shell";
import { homePathForRole } from "@/lib/i18n";

export default function RegisterPage() {
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
        action: "register",
        name: fd.get("name"),
        email: fd.get("email"),
        password: fd.get("password"),
        role: fd.get("role"),
        code: fd.get("code") || undefined,
      }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error || "Registration failed");
      return;
    }
    router.push(homePathForRole(data.user.role));
    router.refresh();
  }

  return (
    <PageShell
      eyebrow="Registration"
      title="Create your MedCare account"
      description="Enter a subscription code from your purchase email if you have one."
    >
      <form className="panel form-narrow" onSubmit={onSubmit}>
        <label className="label">Full name</label>
        <input className="input" name="name" required />
        <label className="label">Email</label>
        <input className="input" name="email" type="email" required />
        <label className="label">Password</label>
        <input className="input" name="password" type="password" required minLength={8} />
        <label className="label">Account type</label>
        <select className="input" name="role" defaultValue="PATIENT">
          <option value="PATIENT">Patient</option>
          <option value="DOCTOR">Doctor</option>
          <option value="NURSE">Nurse</option>
          <option value="HOSPITAL">Hospital</option>
          <option value="COMPANY">Company</option>
        </select>
        <label className="label">Subscription code (optional)</label>
        <input className="input" name="code" placeholder="From purchase email" />
        {error && <p className="error-text">{error}</p>}
        <button className="btn btn-primary form-submit" disabled={loading} type="submit">
          {loading ? "Creating…" : "Register"}
        </button>
      </form>
    </PageShell>
  );
}
