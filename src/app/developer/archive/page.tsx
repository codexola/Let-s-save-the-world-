"use client";

import { FormEvent, useEffect, useState } from "react";
import { PageShell } from "@/components/page-shell";

type Archive = {
  id: string;
  name: string;
  description: string | null;
  payload: string;
  version: number;
  updatedAt: string;
};

export default function DeveloperArchivePage() {
  const [archives, setArchives] = useState<Archive[]>([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function load() {
    const res = await fetch("/api/archive");
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Forbidden");
      return;
    }
    setArchives(data.archives || []);
  }

  useEffect(() => {
    load();
  }, []);

  async function initArchive(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const res = await fetch("/api/archive", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "init",
        name: fd.get("name"),
        description: fd.get("description"),
        payload: { note: fd.get("note"), blogStats: {} },
      }),
    });
    const data = await res.json();
    setMessage(res.ok ? `Initialized ${data.archive.name}` : data.error);
    load();
  }

  return (
    <PageShell
      eyebrow="Developer"
      title="Platform archive"
      description="Initialize and modify archives including blogStats subscriber/view counts."
    >
      {error && <p className="error-text">{error}</p>}
      {message && <p className="muted">{message}</p>}

      <form className="panel form-narrow" onSubmit={initArchive}>
        <h2 style={{ marginTop: 0 }}>Initialize archive</h2>
        <label className="label">Name</label>
        <input className="input" name="name" required />
        <label className="label">Description</label>
        <input className="input" name="description" />
        <label className="label">Note</label>
        <textarea className="input" name="note" rows={3} />
        <button className="btn btn-primary form-submit" type="submit">
          Initialize
        </button>
      </form>

      <div className="panel" style={{ marginTop: "1.25rem" }}>
        <h2 style={{ marginTop: 0 }}>Archives</h2>
        {archives.map((a) => {
          let blogStats = null;
          try {
            blogStats = JSON.parse(a.payload).blogStats;
          } catch {
            /* ignore */
          }
          return (
            <div key={a.id} style={{ marginBottom: "1rem", paddingBottom: "1rem", borderBottom: "1px solid var(--line)" }}>
              <strong>{a.name}</strong> v{a.version}
              {blogStats && (
                <p className="muted" style={{ margin: "0.35rem 0 0" }}>
                  Blog stats: {JSON.stringify(blogStats)}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </PageShell>
  );
}
