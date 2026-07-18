"use client";

import { FormEvent, useEffect, useState } from "react";
import { PageShell } from "@/components/page-shell";

type Consultation = {
  id: string;
  symptoms: string;
  analysis: string;
  riskLevel: string;
  specialty: string | null;
  recommendations: string | null;
  emergency: boolean;
  createdAt: string;
};

export default function AiConsultantPage() {
  const [symptoms, setSymptoms] = useState("");
  const [result, setResult] = useState<Consultation | null>(null);
  const [provider, setProvider] = useState("");
  const [history, setHistory] = useState<Consultation[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/ai/consult")
      .then((r) => r.json())
      .then((d) => {
        if (!d.error) setHistory(d.history || []);
      });
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const res = await fetch("/api/ai/consult", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symptoms }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error || "Failed");
      return;
    }
    setResult(data.consultation);
    setProvider(data.provider || "");
    setHistory((h) => [data.consultation, ...h]);
  }

  return (
    <PageShell
      eyebrow="AI Consultant"
      title="Symptom triage"
      description="AI-assisted guidance — not a substitute for professional care."
    >
      <div className="panel" style={{ marginBottom: "1rem", borderColor: "var(--accent)" }}>
        <p className="muted" style={{ margin: 0 }}>
          <strong>Disclaimer:</strong> This AI triage does not replace professional medical judgment.
          Call 119 for emergencies.
        </p>
      </div>

      <form className="panel form-narrow" onSubmit={onSubmit}>
        <label className="label">Describe your symptoms</label>
        <textarea
          className="input"
          rows={4}
          value={symptoms}
          onChange={(e) => setSymptoms(e.target.value)}
          required
          placeholder="e.g. fever and sore throat for 2 days"
        />
        {error && <p className="error-text">{error}</p>}
        <button className="btn btn-primary form-submit" type="submit" disabled={loading}>
          {loading ? "Analyzing…" : "Get guidance"}
        </button>
      </form>

      {result && (
        <div className="panel" style={{ marginTop: "1.25rem" }}>
          <p className="badge">{result.emergency ? "Emergency" : result.riskLevel}</p>
          {provider && <p className="muted">Provider: {provider}</p>}
          <pre style={{ whiteSpace: "pre-wrap", fontFamily: "inherit" }}>{result.analysis}</pre>
          {result.recommendations && <p><strong>Recommendations:</strong> {result.recommendations}</p>}
        </div>
      )}

      {history.length > 0 && (
        <div className="panel" style={{ marginTop: "1.25rem" }}>
          <h2 style={{ marginTop: 0 }}>History</h2>
          {history.slice(0, 5).map((h) => (
            <div key={h.id} style={{ marginBottom: "0.75rem" }}>
              <span className="badge">{h.riskLevel}</span> {h.symptoms.slice(0, 80)}
            </div>
          ))}
        </div>
      )}
    </PageShell>
  );
}
