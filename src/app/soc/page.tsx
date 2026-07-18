"use client";

import { FormEvent, useEffect, useState } from "react";
import { PageShell } from "@/components/page-shell";

export default function SocPage() {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function load() {
    const res = await fetch("/api/soc");
    const d = await res.json();
    if (!res.ok) setError(d.error || "Access denied");
    else setData(d);
  }

  useEffect(() => {
    load();
  }, []);

  const monitoring = data?.monitoring as Record<string, unknown> | undefined;
  const incidents = (data?.incidents || []) as Array<{ id: string; title: string; severity: string; status: string; summary: string }>;
  const alerts = (data?.securityAlerts || []) as Array<{ id: string; title: string; severity: string; status: string; source: string }>;
  const scans = (data?.malwareScans || []) as Array<{ id: string; target: string; status: string; findings: string | null }>;
  const anomalies = (data?.accountAnomalies || []) as Array<{ id: string; anomalyType: string; score: number; details: string | null }>;
  const siem = data?.siem as { exports: Array<{ id: string; eventCount: number; createdAt: string }>; integration: string } | undefined;

  return (
    <PageShell
      eyebrow="SOC"
      title="Security operations center"
      description="24/7 monitoring · threat detection · SIEM · incident response · fraud · malware · account anomalies · audit logging · security alerts · compliance reporting."
    >
      {error && <p className="error-text">{error}</p>}
      {message && <p className="muted">{message}</p>}

      {monitoring && (
        <div className="feature-grid" style={{ marginBottom: "1rem" }}>
          {Object.entries(monitoring).map(([k, v]) => (
            <div key={k} className="panel">
              <p className="badge">{k}</p>
              <p style={{ fontSize: "1.2rem", margin: 0 }}>{String(v)}</p>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", marginBottom: "1rem" }}>
        <button
          className="btn btn-primary"
          type="button"
          onClick={async () => {
            await fetch("/api/soc", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                action: "open_incident",
                title: "Manual SOC incident",
                severity: "medium",
                summary: "Opened from SOC console",
              }),
            });
            setMessage("Incident opened");
            load();
          }}
        >
          Open incident
        </button>
        <button
          className="btn"
          type="button"
          onClick={async () => {
            const res = await fetch("/api/soc", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action: "siem_export" }),
            });
            const d = await res.json();
            setMessage(`SIEM export ${d.export?.eventCount || 0} events`);
            load();
          }}
        >
          SIEM export
        </button>
        <button
          className="btn"
          type="button"
          onClick={async () => {
            await fetch("/api/soc", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action: "malware_scan", target: "upload-demo.bin" }),
            });
            setMessage("Malware scan complete");
            load();
          }}
        >
          Malware scan
        </button>
        <button
          className="btn"
          type="button"
          onClick={async () => {
            await fetch("/api/soc", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                action: "raise_alert",
                title: "Fraud rule triggered",
                severity: "critical",
                source: "fraud",
                details: "Velocity check failed",
              }),
            });
            setMessage("Security alert raised");
            load();
          }}
        >
          Raise fraud alert
        </button>
      </div>

      <h3>Incident response</h3>
      {incidents.map((i) => (
        <div key={i.id} className="panel" style={{ marginBottom: "0.5rem" }}>
          <span className="badge">{i.severity}</span> <strong>{i.title}</strong> — {i.status}
          <p className="muted">{i.summary}</p>
          {i.status !== "resolved" && (
            <button
              className="btn"
              type="button"
              onClick={async () => {
                await fetch("/api/soc", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ action: "respond_incident", incidentId: i.id, status: "resolved" }),
                });
                load();
              }}
            >
              Resolve
            </button>
          )}
        </div>
      ))}

      <h3>Security alerts</h3>
      {alerts.map((a) => (
        <p key={a.id}>
          [{a.source}] {a.title} ({a.severity}) — {a.status}{" "}
          {a.status === "open" && (
            <button
              className="btn"
              type="button"
              onClick={async () => {
                await fetch("/api/soc", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ action: "ack_alert", alertId: a.id }),
                });
                load();
              }}
            >
              Ack
            </button>
          )}
        </p>
      ))}

      <h3>Malware scanning</h3>
      {scans.map((s) => (
        <p key={s.id} className="muted">
          {s.target}: {s.status} — {s.findings}
        </p>
      ))}

      <h3>Account anomaly detection</h3>
      {anomalies.map((a) => (
        <p key={a.id}>
          {a.anomalyType} score {a.score} — {a.details}
        </p>
      ))}

      <h3>SIEM integration</h3>
      <p className="muted">{siem?.integration}</p>
      {(siem?.exports || []).map((e) => (
        <p key={e.id} className="muted">
          Export {e.eventCount} events @ {new Date(e.createdAt).toLocaleString()}
        </p>
      ))}

      <h3>Compliance reporting</h3>
      <pre className="panel" style={{ whiteSpace: "pre-wrap", fontSize: "0.8rem" }}>
        {JSON.stringify(data?.complianceReporting, null, 2)}
      </pre>
    </PageShell>
  );
}
