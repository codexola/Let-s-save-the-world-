"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PageShell } from "@/components/page-shell";

type Alert = {
  id: string;
  metricType: string;
  value: number;
  severity: string;
  message: string;
  emergency: boolean;
  acknowledged: boolean;
  createdAt: string;
  patient?: { name: string };
};

export default function RpmPage() {
  const [monitors, setMonitors] = useState<string[]>([]);
  const [latest, setLatest] = useState<Record<string, { value: number; unit: string | null }>>({});
  const [score, setScore] = useState<{ score: number; breakdown: string | null; dateKey: string } | null>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [clinicianAlerts, setClinicianAlerts] = useState<Alert[]>([]);
  const [enrollment, setEnrollment] = useState<{ active: boolean; lastScore: number | null } | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [role, setRole] = useState("");

  async function load() {
    const res = await fetch("/api/rpm");
    const d = await res.json();
    if (!res.ok) {
      setError(d.error || "Sign in required");
      return;
    }
    setMonitors(d.monitors || []);
    setLatest(d.latest || {});
    setScore(d.score);
    setAlerts(d.alerts || []);
    setClinicianAlerts(d.clinicianAlerts || []);
    setEnrollment(d.enrollment);
  }

  useEffect(() => {
    load();
    fetch("/api/auth")
      .then((r) => r.json())
      .then((d) => setRole(d.user?.role || ""));
  }, []);

  return (
    <PageShell
      eyebrow="Monitoring"
      title="Remote patient monitoring"
      description="AI monitors BP, HR, blood sugar, temperature, ECG, weight, sleep, and medication adherence — daily health score, abnormal detection, emergency alerts, doctor notifications."
    >
      {error && <p className="error-text">{error}</p>}
      {message && <p className="muted">{message}</p>}
      <p className="muted">
        Feed vitals from <Link href="/wearables">Wearables</Link> or Analytics, then run AI check.
      </p>

      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "1rem" }}>
        <button
          className="btn btn-primary"
          type="button"
          onClick={async () => {
            const res = await fetch("/api/rpm", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action: "enroll" }),
            });
            const d = await res.json();
            if (!res.ok) setError(d.error);
            else {
              setMessage("Enrolled in remote patient monitoring");
              load();
            }
          }}
        >
          Enroll in RPM
        </button>
        <button
          className="btn btn-primary"
          type="button"
          onClick={async () => {
            const res = await fetch("/api/rpm", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action: "run_ai" }),
            });
            const d = await res.json();
            if (!res.ok) setError(d.error);
            else {
              setMessage(
                `AI check done — score ${d.score?.score ?? "—"}, ${d.alerts?.length || 0} new alert(s)`
              );
              load();
            }
          }}
        >
          Run AI monitor
        </button>
        <button
          className="btn"
          type="button"
          onClick={async () => {
            const res = await fetch("/api/rpm", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action: "score" }),
            });
            const d = await res.json();
            if (d.score) {
              setScore(d.score);
              setMessage(`Daily health score: ${d.score.score}`);
            }
          }}
        >
          Refresh daily health score
        </button>
      </div>

      <div className="panel" style={{ marginBottom: "1rem" }}>
        <h2 style={{ marginTop: 0 }}>Daily health score</h2>
        <p className="font-display" style={{ fontSize: "2.5rem", margin: 0 }}>
          {score?.score ?? enrollment?.lastScore ?? "—"}
        </p>
        <p className="muted">{score?.dateKey ? `Date ${score.dateKey}` : enrollment?.active ? "Enrolled" : "Not enrolled"}</p>
        {score?.breakdown && (
          <pre style={{ whiteSpace: "pre-wrap", fontSize: "0.8rem" }}>
            {JSON.stringify(JSON.parse(score.breakdown), null, 2)}
          </pre>
        )}
      </div>

      <h3>AI monitors</h3>
      <div className="feature-grid" style={{ marginBottom: "1rem" }}>
        {monitors.map((m) => {
          const key =
            m === "blood_pressure"
              ? "blood_pressure_systolic"
              : m === "ecg"
                ? "ecg_hr"
                : m === "heart_rate"
                  ? "heart_rate"
                  : m;
          const row = latest[key] || latest[m];
          return (
            <div key={m} className="panel">
              <p className="badge">{m.replace(/_/g, " ")}</p>
              <p>
                {row ? (
                  <>
                    {row.value} {row.unit}
                  </>
                ) : (
                  <span className="muted">No recent reading</span>
                )}
              </p>
            </div>
          );
        })}
      </div>

      <h3>Alerts</h3>
      {alerts.map((a) => (
        <div key={a.id} className="panel" style={{ marginBottom: "0.5rem" }}>
          <p>
            <span className="badge">{a.severity}</span> {a.emergency ? "EMERGENCY" : ""} {a.message}
          </p>
          <p className="muted">{new Date(a.createdAt).toLocaleString()}</p>
          {!a.acknowledged && (
            <button
              className="btn"
              type="button"
              onClick={async () => {
                await fetch("/api/rpm", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ action: "acknowledge", id: a.id }),
                });
                load();
              }}
            >
              Acknowledge
            </button>
          )}
        </div>
      ))}
      {alerts.length === 0 && <p className="muted">No alerts yet.</p>}

      {["DOCTOR", "ADMIN", "DEVELOPER", "NURSE"].includes(role) && clinicianAlerts.length > 0 && (
        <div style={{ marginTop: "1.5rem" }}>
          <h3>Doctor notifications</h3>
          {clinicianAlerts.map((a) => (
            <div key={a.id} className="panel" style={{ marginBottom: "0.5rem" }}>
              <strong>{a.patient?.name || "Patient"}</strong>
              <p>
                {a.severity}: {a.message}
              </p>
            </div>
          ))}
        </div>
      )}
    </PageShell>
  );
}
