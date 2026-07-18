"use client";

import { useEffect, useState } from "react";
import { PageShell } from "@/components/page-shell";

export default function DrPage() {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function load() {
    const res = await fetch("/api/dr");
    const d = await res.json();
    if (!res.ok) setError(d.error || "Access denied");
    else setData(d);
  }

  useEffect(() => {
    load();
  }, []);

  const multi = data?.multiRegion as { regions: Array<{ code: string; name: string; role: string; healthy: boolean; lagSeconds: number }>; healthyNodes: number } | undefined;
  const backups = (data?.backupValidation || []) as Array<{ id: string; filename: string; status: string; sizeBytes: number }>;
  const drills = (data?.recoveryDrills || []) as Array<{ id: string; name: string; status: string; validated: boolean; result: string | null }>;
  const plans = (data?.businessContinuityPlans || []) as Array<{ title: string; rtoHours: number; rpoMinutes: number; steps: string[] }>;
  const failovers = (data?.failoverEvents || []) as Array<{ id: string; fromRegion: string; toRegion: string; reason: string; status: string }>;

  return (
    <PageShell
      eyebrow="Resilience"
      title="Disaster recovery & business continuity"
      description="Multi-region · automated backups · cross-region replication · HA · failover · recovery drills · backup validation · BCP plans."
    >
      {error && <p className="error-text">{error}</p>}
      {message && <p className="muted">{message}</p>}

      <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", marginBottom: "1rem" }}>
        <button
          className="btn btn-primary"
          type="button"
          onClick={async () => {
            const res = await fetch("/api/dr", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action: "backup" }),
            });
            const d = await res.json();
            setMessage(res.ok ? `Backup validated ${d.checksum?.slice(0, 12)}` : d.error);
            load();
          }}
        >
          Automated backup + validate
        </button>
        <button
          className="btn"
          type="button"
          onClick={async () => {
            const res = await fetch("/api/dr", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                action: "failover",
                fromRegion: "ap-northeast-1",
                toRegion: "us-west-2",
                reason: "Primary unhealthy drill",
              }),
            });
            const d = await res.json();
            setMessage(res.ok ? `Failover ${d.event.fromRegion} → ${d.event.toRegion}` : d.error);
            load();
          }}
        >
          Failover automation
        </button>
        <button
          className="btn"
          type="button"
          onClick={async () => {
            await fetch("/api/dr", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action: "recovery_drill", name: "Live recovery drill" }),
            });
            setMessage("Recovery drill completed");
            load();
          }}
        >
          Run recovery drill
        </button>
      </div>

      <h3>Multi-region deployment</h3>
      <div className="feature-grid" style={{ marginBottom: "1rem" }}>
        {(multi?.regions || []).map((r) => (
          <div key={r.code} className="panel">
            <p className="badge">{r.role}</p>
            <strong>{r.name}</strong>
            <p className="muted">
              {r.code} · lag {r.lagSeconds}s · {r.healthy ? "healthy" : "down"}
            </p>
          </div>
        ))}
      </div>
      <p className="muted">HA: {String((data?.highAvailability as { status?: string })?.status)} · healthy nodes {multi?.healthyNodes}</p>

      <h3>Cross-region replication</h3>
      <pre className="panel" style={{ whiteSpace: "pre-wrap", fontSize: "0.8rem" }}>
        {JSON.stringify(data?.crossRegionReplication, null, 2)}
      </pre>

      <h3>Backup validation</h3>
      {backups.map((b) => (
        <p key={b.id}>
          {b.filename} · {b.status} · {b.sizeBytes} bytes{" "}
          {b.status !== "validated" && (
            <button
              className="btn"
              type="button"
              onClick={async () => {
                await fetch("/api/dr", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ action: "validate_backup", backupId: b.id }),
                });
                load();
              }}
            >
              Validate
            </button>
          )}
        </p>
      ))}

      <h3>Failover events</h3>
      {failovers.map((f) => (
        <p key={f.id} className="muted">
          {f.fromRegion} → {f.toRegion}: {f.reason} ({f.status})
        </p>
      ))}

      <h3>Recovery drills</h3>
      {drills.map((d) => (
        <p key={d.id}>
          {d.name}: {d.status} {d.validated ? "✓ validated" : ""} — {d.result}
        </p>
      ))}

      <h3>Business continuity plans</h3>
      {plans.map((p) => (
        <div key={p.title} className="panel" style={{ marginBottom: "0.5rem" }}>
          <strong>{p.title}</strong>
          <p className="muted">
            RTO {p.rtoHours}h · RPO {p.rpoMinutes}m
          </p>
          <ol>
            {p.steps.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
        </div>
      ))}
    </PageShell>
  );
}
