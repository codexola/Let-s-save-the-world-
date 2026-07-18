"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { PageShell } from "@/components/page-shell";

export default function AiLabPage() {
  const [summary, setSummary] = useState("");
  const [translated, setTranslated] = useState("");
  const [interactions, setInteractions] = useState<
    Array<{ severity: string; drugA: string; drugB: string; message: string }>
  >([]);
  const [optimize, setOptimize] = useState<Record<string, unknown> | null>(null);
  const [noshows, setNoshows] = useState<
    Array<{ appointmentId: string; risk: number; level: string; factors: string[] }>
  >([]);
  const [forecast, setForecast] = useState<number[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/ai/advanced?action=interactions")
      .then((r) => r.json())
      .then((d) => setInteractions(d.alerts || []));
    fetch("/api/ai/advanced?action=noshow")
      .then((r) => r.json())
      .then((d) => setNoshows(d.predictions || []));
    fetch("/api/ai/advanced?action=ops_forecast")
      .then((r) => r.json())
      .then((d) => setForecast(d.forecastNext4Days || []));
  }, []);

  return (
    <PageShell
      eyebrow="AI Features"
      title="Clinical AI toolkit"
      description="Triage · recommendations · document summarization · translation · appointment optimization · medication interactions · no-show prediction · ops analytics."
    >
      {error && <p className="error-text">{error}</p>}
      {message && <p className="muted">{message}</p>}

      <p className="muted">
        Also use <Link href="/ai-consultant">AI Consultant</Link> (triage) and{" "}
        <Link href="/recommendations">Recommendations</Link>. AI does not replace a physician.
      </p>

      <div className="feature-grid">
        <form
          className="panel"
          onSubmit={async (e: FormEvent<HTMLFormElement>) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            const res = await fetch("/api/ai/advanced", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action: "summarize", text: fd.get("text"), locale: fd.get("locale") }),
            });
            const d = await res.json();
            if (!res.ok) setError(d.error);
            else {
              setSummary(d.summary);
              setMessage(`Summarized via ${d.provider}`);
            }
          }}
        >
          <h3 style={{ marginTop: 0 }}>Document summarization</h3>
          <textarea className="input" name="text" rows={5} required placeholder="Paste lab report / discharge note…" />
          <select className="input" name="locale" defaultValue="en" style={{ marginTop: "0.5rem" }}>
            <option value="en">English</option>
            <option value="ja">Japanese</option>
          </select>
          <button className="btn btn-primary" type="submit" style={{ marginTop: "0.5rem" }}>
            Summarize
          </button>
          {summary && <pre style={{ whiteSpace: "pre-wrap", fontSize: "0.85rem", marginTop: "0.75rem" }}>{summary}</pre>}
        </form>

        <form
          className="panel"
          onSubmit={async (e: FormEvent<HTMLFormElement>) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            const res = await fetch("/api/ai/advanced", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                action: "translate",
                text: fd.get("text"),
                targetLocale: fd.get("target"),
              }),
            });
            const d = await res.json();
            if (!res.ok) setError(d.error);
            else {
              setTranslated(d.translated);
              setMessage(`Translated via ${d.provider}`);
            }
          }}
        >
          <h3 style={{ marginTop: 0 }}>Multilingual consultation translation</h3>
          <textarea className="input" name="text" rows={5} required placeholder="Consultation text…" />
          <select className="input" name="target" defaultValue="ja" style={{ marginTop: "0.5rem" }}>
            <option value="ja">Japanese</option>
            <option value="en">English</option>
          </select>
          <button className="btn btn-primary" type="submit" style={{ marginTop: "0.5rem" }}>
            Translate
          </button>
          {translated && <p style={{ marginTop: "0.75rem" }}>{translated}</p>}
        </form>

        <form
          className="panel"
          onSubmit={async (e: FormEvent<HTMLFormElement>) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            const res = await fetch("/api/ai/advanced", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                action: "interactions",
                medication: fd.get("medication"),
              }),
            });
            const d = await res.json();
            if (!res.ok) setError(d.error);
            else setInteractions(d.alerts || []);
          }}
        >
          <h3 style={{ marginTop: 0 }}>Medication interaction alerts</h3>
          <input className="input" name="medication" placeholder="Add candidate drug e.g. Ibuprofen" />
          <button className="btn btn-primary" type="submit" style={{ marginTop: "0.5rem" }}>
            Check interactions
          </button>
          <ul style={{ marginTop: "0.75rem" }}>
            {interactions.map((a, i) => (
              <li key={i}>
                <span className="badge">{a.severity}</span> {a.drugA} × {a.drugB}: {a.message}
              </li>
            ))}
            {interactions.length === 0 && <li className="muted">No alerts</li>}
          </ul>
        </form>

        <form
          className="panel"
          onSubmit={async (e: FormEvent<HTMLFormElement>) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            const res = await fetch("/api/ai/advanced", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                action: "optimize",
                doctorId: fd.get("doctorId"),
                date: fd.get("date"),
              }),
            });
            const d = await res.json();
            if (!res.ok) setError(d.error);
            else setOptimize(d);
          }}
        >
          <h3 style={{ marginTop: 0 }}>Appointment optimization</h3>
          <input className="input" name="doctorId" placeholder="Doctor user ID" required />
          <input className="input" name="date" type="date" style={{ marginTop: "0.5rem" }} />
          <button className="btn btn-primary" type="submit" style={{ marginTop: "0.5rem" }}>
            Optimize day
          </button>
          {optimize && (
            <pre style={{ whiteSpace: "pre-wrap", fontSize: "0.8rem", marginTop: "0.75rem" }}>
              {JSON.stringify(optimize, null, 2)}
            </pre>
          )}
        </form>
      </div>

      <div className="two-col-grid" style={{ marginTop: "1.25rem" }}>
        <div className="panel">
          <h3 style={{ marginTop: 0 }}>Predictive no-show analysis</h3>
          {noshows.slice(0, 10).map((p) => (
            <p key={p.appointmentId} className="muted">
              <span className="badge">{p.level}</span> risk {p.risk} — {p.factors.join("; ")}
              <button
                className="btn btn-ghost"
                type="button"
                onClick={async () => {
                  const res = await fetch("/api/ai/advanced", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ action: "mark_no_show", appointmentId: p.appointmentId }),
                  });
                  const d = await res.json();
                  setMessage(res.ok ? "Marked NO_SHOW" : d.error);
                }}
              >
                Mark no-show
              </button>
            </p>
          ))}
          {noshows.length === 0 && <p className="muted">No upcoming appointments to score.</p>}
        </div>
        <div className="panel">
          <h3 style={{ marginTop: 0 }}>Hospital operational forecast</h3>
          <p className="muted">Next 4 days occupancy proxy %</p>
          <div className="feature-grid">
            {forecast.map((v, i) => (
              <div key={i} className="panel">
                <p className="badge">Day +{i + 1}</p>
                <h3>{v}%</h3>
              </div>
            ))}
          </div>
        </div>
      </div>
    </PageShell>
  );
}
