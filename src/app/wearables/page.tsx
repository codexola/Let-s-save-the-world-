"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PageShell } from "@/components/page-shell";

type Platform = { id: string; name: string };
type Conn = {
  id: string;
  platform: string;
  status: string;
  displayName: string | null;
  lastSyncAt: string | null;
  syncEnabled: boolean;
};
type MetricType = { type: string; unit: string };

export default function WearablesPage() {
  const [platforms, setPlatforms] = useState<Platform[]>([]);
  const [metricTypes, setMetricTypes] = useState<MetricType[]>([]);
  const [connections, setConnections] = useState<Conn[]>([]);
  const [latest, setLatest] = useState<Record<string, { value: number; unit: string | null; source: string | null }>>({});
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function load() {
    const res = await fetch("/api/wearables");
    const d = await res.json();
    if (!res.ok) {
      setError(d.error || "Sign in required");
      return;
    }
    setPlatforms(d.platforms || []);
    setMetricTypes(d.metricTypes || []);
    setConnections(d.connections || []);
    setLatest(d.latest || {});
  }

  useEffect(() => {
    load();
  }, []);

  const connected = new Set(connections.filter((c) => c.status === "connected").map((c) => c.platform));

  return (
    <PageShell
      eyebrow="Devices"
      title="Wearable device integration"
      description="Apple Health · Google Health Connect · Fitbit · Garmin · Samsung · Oura · WHOOP · Polar · Withings — vitals sync in real time."
    >
      {error && <p className="error-text">{error}</p>}
      {message && <p className="muted">{message}</p>}
      <p className="muted">
        After sync, open <Link href="/rpm">Remote Patient Monitoring</Link> for AI checks and doctor alerts.
      </p>

      <div className="feature-grid" style={{ marginBottom: "1.25rem" }}>
        {platforms.map((p) => {
          const on = connected.has(p.id);
          const conn = connections.find((c) => c.platform === p.id);
          return (
            <div key={p.id} className="panel">
              <h3 style={{ marginTop: 0 }}>{p.name}</h3>
              <p className="badge">{on ? "connected" : "not connected"}</p>
              {conn?.lastSyncAt && (
                <p className="muted">Last sync: {new Date(conn.lastSyncAt).toLocaleString()}</p>
              )}
              <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap" }}>
                {!on ? (
                  <button
                    className="btn btn-primary"
                    type="button"
                    onClick={async () => {
                      const res = await fetch("/api/wearables", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ action: "connect", platform: p.id }),
                      });
                      const d = await res.json();
                      if (!res.ok) setError(d.error);
                      else {
                        setMessage(`Connected ${p.name}`);
                        load();
                      }
                    }}
                  >
                    Connect
                  </button>
                ) : (
                  <>
                    <button
                      className="btn btn-primary"
                      type="button"
                      onClick={async () => {
                        const res = await fetch("/api/wearables", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ action: "realtime_sync", platform: p.id }),
                        });
                        const d = await res.json();
                        if (!res.ok) setError(d.error);
                        else {
                          setMessage(`Real-time sync: ${d.metricsCreated} metrics from ${p.name}`);
                          load();
                        }
                      }}
                    >
                      Real-time sync
                    </button>
                    <button
                      className="btn"
                      type="button"
                      onClick={async () => {
                        await fetch("/api/wearables", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ action: "disconnect", platform: p.id }),
                        });
                        setMessage(`Disconnected ${p.name}`);
                        load();
                      }}
                    >
                      Disconnect
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="panel" style={{ marginBottom: "1rem" }}>
        <h2 style={{ marginTop: 0 }}>Collected data types</h2>
        <p className="muted">{metricTypes.map((m) => `${m.type.replace(/_/g, " ")} (${m.unit})`).join(" · ")}</p>
        <button
          className="btn btn-primary"
          type="button"
          onClick={async () => {
            const res = await fetch("/api/wearables", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action: "realtime_sync" }),
            });
            const d = await res.json();
            if (!res.ok) setError(d.error);
            else {
              setMessage(`Synced all platforms — ${d.metricsCreated} samples @ ${d.syncedAt}`);
              load();
            }
          }}
        >
          Sync all connected devices
        </button>
      </div>

      <div className="feature-grid">
        {Object.entries(latest).map(([type, row]) => (
          <div key={type} className="panel">
            <p className="badge">{row.source}</p>
            <strong>{type.replace(/_/g, " ")}</strong>
            <p>
              {row.value} {row.unit}
            </p>
          </div>
        ))}
        {Object.keys(latest).length === 0 && <p className="muted">Connect a device and run real-time sync.</p>}
      </div>
    </PageShell>
  );
}
