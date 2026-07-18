"use client";

import { useEffect, useState } from "react";
import { PageShell } from "@/components/page-shell";

type Goal = { id: string; category: string; title: string; progress: number; targetValue: number | null; unit: string | null };

export default function HealthCoachPage() {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [checkIns, setCheckIns] = useState<Array<{ focusArea: string; advice: string; healthScore: number | null; createdAt: string }>>([]);
  const [areas, setAreas] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [score, setScore] = useState<number | null>(null);

  async function load() {
    const res = await fetch("/api/health-coach");
    const d = await res.json();
    if (!res.ok) {
      setError(d.error || "Sign in required");
      return;
    }
    setGoals(d.goals || []);
    setCheckIns(d.checkIns || []);
    setAreas(d.areas || []);
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <PageShell
      eyebrow="Coaching"
      title="AI health coach"
      description="Nutrition · exercise · sleep · stress · smoking cessation · weight · medication reminders · daily coaching · health scoring · goal tracking."
    >
      {error && <p className="error-text">{error}</p>}
      {message && <p className="muted">{message}</p>}

      <div className="panel" style={{ marginBottom: "1rem" }}>
        <h2 style={{ marginTop: 0 }}>Health score {score ?? checkIns[0]?.healthScore ?? "—"}</h2>
        <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap" }}>
          <button
            className="btn btn-primary"
            type="button"
            onClick={async () => {
              const res = await fetch("/api/health-coach", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "daily" }),
              });
              const d = await res.json();
              if (!res.ok) setError(d.error);
              else {
                setScore(d.healthScore);
                setMessage(`Daily coaching: ${d.focusArea} — med reminders ${d.medicationReminders ? "on" : "off"}`);
                load();
              }
            }}
          >
            Daily coaching
          </button>
          {areas.map((a) => (
            <button
              key={a}
              className="btn"
              type="button"
              onClick={async () => {
                const res = await fetch("/api/health-coach", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ action: "coach", focusArea: a }),
                });
                const d = await res.json();
                if (res.ok) {
                  setScore(d.healthScore);
                  setMessage(d.checkIn.advice);
                  load();
                }
              }}
            >
              {a.replace(/_/g, " ")}
            </button>
          ))}
        </div>
      </div>

      <h3>Goal tracking</h3>
      {goals.map((g) => (
        <div key={g.id} className="panel" style={{ marginBottom: "0.5rem" }}>
          <p className="badge">{g.category.replace(/_/g, " ")}</p>
          <strong>{g.title}</strong>
          <p>
            Progress {g.progress}%
            {g.targetValue != null ? ` · target ${g.targetValue} ${g.unit || ""}` : ""}
          </p>
          <button
            className="btn"
            type="button"
            onClick={async () => {
              await fetch("/api/health-coach", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  action: "goal_progress",
                  goalId: g.id,
                  progress: Math.min(100, g.progress + 10),
                }),
              });
              load();
            }}
          >
            +10% progress
          </button>
        </div>
      ))}

      <h3>Recent coaching</h3>
      {checkIns.map((c, i) => (
        <p key={i} className="muted">
          [{c.focusArea}] {c.advice} — score {c.healthScore} · {new Date(c.createdAt).toLocaleString()}
        </p>
      ))}
    </PageShell>
  );
}
