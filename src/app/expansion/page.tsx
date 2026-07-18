"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PageShell } from "@/components/page-shell";

type Mod = {
  key: string;
  name: string;
  category: string;
  status: string;
  summary: string;
  relatedHref: string | null;
};

export default function ExpansionPage() {
  const [modules, setModules] = useState<Mod[]>([]);
  const [ext, setExt] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function load() {
    const res = await fetch("/api/expansion");
    const d = await res.json();
    if (!res.ok) setError(d.error || "Sign in required");
    else {
      setModules(d.modules || []);
      setExt(d.extensibility || null);
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <PageShell
      eyebrow="Roadmap"
      title="Future expansion modules"
      description="Extensible slots for genomics, AI rehab, robotics care, hospital IoT, DTx, mental health, nutrition, dental/vision, cross-border telemedicine, and population health research networks."
    >
      {error && <p className="error-text">{error}</p>}
      {message && <p className="muted">{message}</p>}

      {ext && (
        <div className="panel" style={{ marginBottom: "1rem" }}>
          <h3 style={{ marginTop: 0 }}>Platform extensibility</h3>
          <p className="muted">{String(ext.note)}</p>
          <p>
            Feature flags · module slots · API platform at <Link href="/developers">/developers</Link>
          </p>
        </div>
      )}

      <div className="feature-grid">
        {modules.map((m) => (
          <div key={m.key} className="panel">
            <p className="badge">{m.status}</p>
            <h3 style={{ marginTop: 0 }}>{m.name}</h3>
            <p className="muted">{m.category}</p>
            <p>{m.summary}</p>
            {m.relatedHref && (
              <p>
                <Link href={m.relatedHref}>Related: {m.relatedHref}</Link>
              </p>
            )}
            <button
              className="btn"
              type="button"
              onClick={async () => {
                const next = m.status === "planned" ? "beta" : m.status === "beta" ? "ga" : "planned";
                const res = await fetch("/api/expansion", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ action: "set_status", key: m.key, status: next }),
                });
                const d = await res.json();
                setMessage(res.ok ? `${m.key} → ${d.module.status}` : d.error);
                load();
              }}
            >
              Advance status
            </button>
          </div>
        ))}
      </div>
    </PageShell>
  );
}
