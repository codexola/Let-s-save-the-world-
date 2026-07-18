"use client";

import { FormEvent, useEffect, useState } from "react";
import { PageShell } from "@/components/page-shell";

export default function GrcPage() {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function load() {
    const res = await fetch("/api/grc");
    const d = await res.json();
    if (!res.ok) {
      setError(d.error);
      return;
    }
    setData(d);
  }

  useEffect(() => {
    load();
  }, []);

  async function updateRetention(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const res = await fetch("/api/grc", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "update_retention",
        resource: fd.get("resource"),
        retainDays: Number(fd.get("retainDays")),
        actionType: fd.get("actionType"),
        description: fd.get("description"),
      }),
    });
    const d = await res.json();
    setMessage(res.ok ? "Retention policy saved" : d.error);
    load();
  }

  const stats = data?.stats as Record<string, number> | undefined;
  const policies = (data?.retentionPolicies || []) as Array<{
    id: string;
    resource: string;
    retainDays: number;
    action: string;
    description: string | null;
  }>;
  const dsrs = (data?.dataSubjectRequests || []) as Array<{
    id: string;
    type: string;
    status: string;
    user?: { email: string; name: string };
  }>;
  const frameworks = (data?.frameworks || []) as Array<{ id: string; name: string; notes: string }>;

  return (
    <PageShell
      eyebrow="GRC"
      title="Governance, risk & compliance"
      description="APPI / HIPAA-aligned / GDPR controls — retention policies, DSRs, consent catalog, audit scale."
    >
      {error && <p className="error-text">{error}</p>}
      {message && <p className="muted">{message}</p>}

      <div className="feature-grid" style={{ marginBottom: "1rem" }}>
        {frameworks.map((f) => (
          <div key={f.id} className="panel">
            <p className="badge">{f.id.toUpperCase()}</p>
            <h3>{f.name}</h3>
            <p className="muted">{f.notes}</p>
          </div>
        ))}
      </div>

      {stats && (
        <div className="feature-grid" style={{ marginBottom: "1rem" }}>
          {Object.entries(stats).map(([k, v]) => (
            <div key={k} className="panel">
              <p className="badge">{k}</p>
              <h3>{v}</h3>
            </div>
          ))}
        </div>
      )}

      <div className="panel" style={{ marginBottom: "1rem" }}>
        <h2 style={{ marginTop: 0 }}>Data retention policies</h2>
        <table className="table">
          <thead>
            <tr>
              <th>Resource</th>
              <th>Days</th>
              <th>Action</th>
              <th>Description</th>
            </tr>
          </thead>
          <tbody>
            {policies.map((p) => (
              <tr key={p.id}>
                <td>{p.resource}</td>
                <td>{p.retainDays}</td>
                <td>{p.action}</td>
                <td>{p.description}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <form onSubmit={updateRetention} style={{ marginTop: "1rem" }} className="form-narrow">
          <label className="label">Resource</label>
          <input className="input" name="resource" required placeholder="notifications" />
          <label className="label">Retain days</label>
          <input className="input" name="retainDays" type="number" defaultValue={365} />
          <label className="label">Action</label>
          <select className="input" name="actionType" defaultValue="anonymize">
            <option value="delete">delete</option>
            <option value="anonymize">anonymize</option>
            <option value="keep">keep</option>
          </select>
          <label className="label">Description</label>
          <input className="input" name="description" />
          <button className="btn btn-primary" type="submit" style={{ marginTop: "0.5rem" }}>
            Upsert policy
          </button>
        </form>
        <button
          className="btn"
          type="button"
          style={{ marginTop: "0.75rem" }}
          onClick={async () => {
            const res = await fetch("/api/grc", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action: "run_retention" }),
            });
            const d = await res.json();
            setMessage(res.ok ? `Retention job: ${JSON.stringify(d.results)}` : d.error);
          }}
        >
          Run retention job
        </button>
      </div>

      <div className="panel">
        <h2 style={{ marginTop: 0 }}>Open data subject requests</h2>
        {dsrs.length === 0 && <p className="muted">No open requests.</p>}
        {dsrs.map((r) => (
          <div key={r.id} style={{ marginBottom: "0.5rem" }}>
            {r.type} — {r.user?.email} <span className="badge">{r.status}</span>
            <button
              className="btn btn-ghost"
              type="button"
              onClick={async () => {
                await fetch("/api/grc", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    action: "resolve_dsr",
                    id: r.id,
                    status: "completed",
                    resolution: "Completed by compliance officer",
                  }),
                });
                load();
              }}
            >
              Resolve
            </button>
          </div>
        ))}
      </div>
    </PageShell>
  );
}
