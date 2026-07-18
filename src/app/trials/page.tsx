"use client";

import { FormEvent, useEffect, useState } from "react";
import { PageShell } from "@/components/page-shell";

type Trial = {
  id: string;
  title: string;
  eligibility: string | null;
  compensation: string | null;
  location: string | null;
  consentForm: string | null;
  scheduleNotes: string | null;
  monitoringPlan: string | null;
  resultsSummary: string | null;
  status: string;
  enrolledCount: number;
  targetEnrollment: number;
  researcher?: { name: string } | null;
};

type Ranked = { trial: Trial; match: { score: number; reasons: string[] } };

export default function TrialsPage() {
  const [ranked, setRanked] = useState<Ranked[]>([]);
  const [mine, setMine] = useState<Array<{ id: string; status: string; matchScore: number | null; trial: Trial; scheduledAt: string | null }>>([]);
  const [role, setRole] = useState("");
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function load() {
    const res = await fetch("/api/trials");
    const d = await res.json();
    if (!res.ok) {
      setError(d.error || "Sign in required");
      return;
    }
    setRanked(d.ranked || []);
    setMine(d.myParticipations || []);
  }

  useEffect(() => {
    load();
    fetch("/api/auth")
      .then((r) => r.json())
      .then((d) => setRole(d.user?.role || ""));
  }, []);

  return (
    <PageShell
      eyebrow="Research"
      title="Clinical trial platform"
      description="Researchers publish studies · patient recruitment · eligibility · compensation · location · consent · scheduling · monitoring · results · AI matching."
    >
      {error && <p className="error-text">{error}</p>}
      {message && <p className="muted">{message}</p>}

      {["RESEARCHER", "DOCTOR", "ADMIN", "DEVELOPER"].includes(role) && (
        <form
          className="panel form-narrow"
          style={{ marginBottom: "1rem" }}
          onSubmit={async (e: FormEvent) => {
            e.preventDefault();
            const res = await fetch("/api/trials", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                action: "publish",
                title,
                eligibility: "Adults 18+ with condition under study",
                compensation: "Stipend provided",
                location: "Tokyo",
                consentForm: "I consent to participate in this clinical study.",
                scheduleNotes: "Baseline + follow-ups",
                monitoringPlan: "Safety labs and AE reporting",
                tags: "research",
              }),
            });
            const d = await res.json();
            if (!res.ok) setError(d.error);
            else {
              setMessage(`Published: ${d.trial.title}`);
              setTitle("");
              load();
            }
          }}
        >
          <h3 style={{ marginTop: 0 }}>Publish clinical study</h3>
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} required placeholder="Study title" />
          <button className="btn btn-primary form-submit" type="submit">
            Publish
          </button>
        </form>
      )}

      <h3>AI matching (ranked for you)</h3>
      {ranked.map(({ trial, match }) => (
        <div key={trial.id} className="panel" style={{ marginBottom: "0.75rem" }}>
          <h3 style={{ marginTop: 0 }}>
            {trial.title} <span className="badge">AI match {match.score}</span>
          </h3>
          <p className="muted">{match.reasons.join(" · ")}</p>
          <p>
            <strong>Eligibility:</strong> {trial.eligibility}
          </p>
          <p>
            <strong>Compensation:</strong> {trial.compensation}
          </p>
          <p>
            <strong>Location:</strong> {trial.location}
          </p>
          <p className="muted">Schedule: {trial.scheduleNotes}</p>
          <p className="muted">Monitoring: {trial.monitoringPlan}</p>
          <p className="muted">
            Enrollment {trial.enrolledCount}/{trial.targetEnrollment} · {trial.researcher?.name || "Research team"}
          </p>
          {trial.resultsSummary && <p>Results: {trial.resultsSummary}</p>}
          <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap" }}>
            <button
              className="btn"
              type="button"
              onClick={async () => {
                const res = await fetch("/api/trials", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ action: "apply", trialId: trial.id }),
                });
                const d = await res.json();
                if (!res.ok) setError(d.error);
                else {
                  setMessage(`Applied — match ${d.match.score}`);
                  load();
                }
              }}
            >
              Apply / recruit
            </button>
            <button
              className="btn btn-primary"
              type="button"
              onClick={async () => {
                const res = await fetch("/api/trials", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ action: "consent", trialId: trial.id, signConsent: true }),
                });
                const d = await res.json();
                if (!res.ok) setError(d.error);
                else {
                  setMessage("Consent form signed");
                  load();
                }
              }}
            >
              Sign consent
            </button>
            {["RESEARCHER", "DOCTOR", "ADMIN", "DEVELOPER"].includes(role) && (
              <button
                className="btn"
                type="button"
                onClick={async () => {
                  await fetch("/api/trials", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      action: "publish_results",
                      trialId: trial.id,
                      resultsSummary: "Primary endpoint met in interim analysis (demo).",
                      status: "completed",
                    }),
                  });
                  load();
                  setMessage("Results published");
                }}
              >
                Publish results
              </button>
            )}
          </div>
          {trial.consentForm && (
            <pre style={{ whiteSpace: "pre-wrap", fontSize: "0.8rem", marginTop: "0.5rem" }}>{trial.consentForm}</pre>
          )}
        </div>
      ))}

      <h3>My participation — scheduling & monitoring</h3>
      {mine.map((p) => (
        <div key={p.id} className="panel" style={{ marginBottom: "0.5rem" }}>
          <strong>
            {p.trial.title} <span className="badge">{p.status}</span> match {p.matchScore ?? "—"}
          </strong>
          <p className="muted">Scheduled: {p.scheduledAt ? new Date(p.scheduledAt).toLocaleString() : "—"}</p>
          <button
            className="btn"
            type="button"
            onClick={async () => {
              await fetch("/api/trials", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  action: "monitor",
                  id: p.id,
                  status: "monitoring",
                  monitoringNotes: "Vitals stable; adherence OK (demo).",
                }),
              });
              load();
              setMessage("Monitoring note saved");
            }}
          >
            Add monitoring
          </button>
          <button
            className="btn"
            type="button"
            onClick={async () => {
              await fetch("/api/trials", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  action: "results",
                  id: p.id,
                  status: "completed",
                  resultNotes: "Completed study visits; patient-reported outcomes recorded.",
                }),
              });
              load();
            }}
          >
            Record results
          </button>
        </div>
      ))}
    </PageShell>
  );
}
