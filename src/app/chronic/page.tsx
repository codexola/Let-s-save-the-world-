"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { PageShell } from "@/components/page-shell";

type Condition = {
  id: string;
  condition: string;
  status: string;
  lifestyleAdvice: string | null;
  nutritionAdvice: string | null;
  exercisePlan: string | null;
  aiMonitoringNotes: string | null;
  nextFollowUpAt: string | null;
  progressScore: number | null;
  reminders: Array<{ id: string; medication: string; dosage: string | null; schedule: string; nextDueAt: string | null }>;
  progressLogs: Array<{ id: string; metric: string; value: number; unit: string | null; recordedAt: string }>;
};

export default function ChronicPage() {
  const [supported, setSupported] = useState<string[]>([]);
  const [conditions, setConditions] = useState<Condition[]>([]);
  const [selected, setSelected] = useState("Hypertension");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [progressValue, setProgressValue] = useState("120");

  async function load() {
    const res = await fetch("/api/chronic");
    const d = await res.json();
    if (!res.ok) {
      setError(d.error || "Sign in required");
      return;
    }
    setSupported(d.supported || []);
    setConditions(d.conditions || []);
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <PageShell
      eyebrow="Chronic care"
      title="Chronic disease management"
      description="Diabetes · Hypertension · Heart · Cancer · Kidney · COPD · Asthma · Mental Health · Alzheimer's · Parkinson's · Arthritis — reminders, progress, follow-ups, lifestyle/nutrition/exercise, AI monitoring."
    >
      {error && <p className="error-text">{error}</p>}
      {message && <p className="muted">{message}</p>}
      <p className="muted">
        Complements <Link href="/rpm">RPM</Link> and <Link href="/ehr">EHR</Link>.
      </p>

      <form
        className="panel form-narrow"
        style={{ marginBottom: "1rem" }}
        onSubmit={async (e: FormEvent) => {
          e.preventDefault();
          const res = await fetch("/api/chronic", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "enroll", condition: selected }),
          });
          const d = await res.json();
          if (!res.ok) setError(d.error);
          else {
            setMessage(`Enrolled in ${selected}`);
            load();
          }
        }}
      >
        <h3 style={{ marginTop: 0 }}>Enroll in condition</h3>
        <select className="input" value={selected} onChange={(e) => setSelected(e.target.value)}>
          {supported.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <button className="btn btn-primary form-submit" type="submit">
          Enroll + care plan
        </button>
      </form>

      <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", marginBottom: "1rem" }}>
        <button
          className="btn btn-primary"
          type="button"
          onClick={async () => {
            const res = await fetch("/api/chronic", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action: "ai_monitor" }),
            });
            const d = await res.json();
            if (!res.ok) setError(d.error);
            else {
              setMessage(`AI monitoring: ${d.conditions} conditions · RPM alerts ${d.rpmAlerts}`);
              load();
            }
          }}
        >
          Run AI monitoring
        </button>
        <button
          className="btn"
          type="button"
          onClick={async () => {
            const res = await fetch("/api/chronic", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action: "reminders" }),
            });
            const d = await res.json();
            setMessage(`Medication reminders sent: ${d.sent}`);
          }}
        >
          Send medication reminders
        </button>
      </div>

      {conditions.map((c) => (
        <div key={c.id} className="panel" style={{ marginBottom: "1rem" }}>
          <h2 style={{ marginTop: 0 }}>
            {c.condition} <span className="badge">{c.status}</span> · score {c.progressScore ?? "—"}
          </h2>
          <p className="muted">Next doctor follow-up: {c.nextFollowUpAt ? new Date(c.nextFollowUpAt).toLocaleDateString() : "—"}</p>
          <div className="feature-grid">
            <div>
              <p className="badge">Lifestyle</p>
              <p>{c.lifestyleAdvice}</p>
            </div>
            <div>
              <p className="badge">Nutrition coaching</p>
              <p>{c.nutritionAdvice}</p>
            </div>
            <div>
              <p className="badge">Exercise plan</p>
              <p>{c.exercisePlan}</p>
            </div>
            <div>
              <p className="badge">AI monitoring</p>
              <p>{c.aiMonitoringNotes}</p>
            </div>
          </div>
          <h4>Medication reminders</h4>
          <ul>
            {c.reminders.map((r) => (
              <li key={r.id}>
                {r.medication} {r.dosage} — {r.schedule}
                {r.nextDueAt ? ` · next ${new Date(r.nextDueAt).toLocaleString()}` : ""}
              </li>
            ))}
          </ul>
          <h4>Progress tracking</h4>
          <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", alignItems: "center" }}>
            <input className="input" style={{ width: 100 }} value={progressValue} onChange={(e) => setProgressValue(e.target.value)} />
            <button
              className="btn"
              type="button"
              onClick={async () => {
                await fetch("/api/chronic", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    action: "progress",
                    conditionId: c.id,
                    metric: "clinical_marker",
                    value: Number(progressValue),
                    unit: "unit",
                  }),
                });
                load();
                setMessage("Progress logged");
              }}
            >
              Log progress
            </button>
            <button
              className="btn btn-primary"
              type="button"
              onClick={async () => {
                await fetch("/api/chronic", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ action: "follow_up", conditionId: c.id, days: 14 }),
                });
                load();
                setMessage("Doctor follow-up scheduled (+14 days)");
              }}
            >
              Schedule doctor follow-up
            </button>
          </div>
          <ul>
            {c.progressLogs.map((p) => (
              <li key={p.id}>
                {p.metric}: {p.value} {p.unit} — {new Date(p.recordedAt).toLocaleString()}
              </li>
            ))}
          </ul>
        </div>
      ))}
      {conditions.length === 0 && <p className="muted">No chronic enrollments yet — enroll above.</p>}
    </PageShell>
  );
}
