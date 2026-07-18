"use client";

import { FormEvent, useState } from "react";
import { PageShell } from "@/components/page-shell";

export default function SupportPage() {
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const res = await fetch("/api/support", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "inquiry",
        name: fd.get("name"),
        email: fd.get("email"),
        subject: fd.get("subject"),
        body: fd.get("body"),
        target: fd.get("target"),
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error);
      return;
    }
    setMessage(data.message);
    (e.target as HTMLFormElement).reset();
  }

  return (
    <PageShell
      eyebrow="Support"
      title="Contact admin or developer"
      description="Support inquiries are routed to MedCare staff only — not for patient-to-patient messaging."
    >
      <form className="panel form-narrow" onSubmit={onSubmit}>
        <label className="label">Name</label>
        <input className="input" name="name" required />
        <label className="label">Email</label>
        <input className="input" name="email" type="email" required />
        <label className="label">Send to</label>
        <select className="input" name="target" defaultValue="admin">
          <option value="admin">Administrator</option>
          <option value="developer">Developer</option>
        </select>
        <label className="label">Subject</label>
        <input className="input" name="subject" required />
        <label className="label">Message</label>
        <textarea className="input" name="body" rows={5} required />
        {error && <p className="error-text">{error}</p>}
        {message && <p className="muted">{message}</p>}
        <button className="btn btn-primary form-submit" type="submit">
          Send inquiry
        </button>
      </form>
    </PageShell>
  );
}
