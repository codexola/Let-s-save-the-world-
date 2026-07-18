"use client";

import { FormEvent, useEffect, useState } from "react";
import { PageShell } from "@/components/page-shell";

type CdsResult = {
  differentials: Array<{ dx: string; likelihood: string; rationale: string }>;
  interactions: Array<{ severity: string; drugA: string; drugB: string; message: string }>;
  guidelines: Array<{ title: string; summary: string }>;
  risk: { models: Array<{ name: string; score: number; band: string }>; note: string };
  labInterpretation: { summary: string; flags: string[]; advice: string };
  imagingAssistance: string;
  documentationSupport: string;
  literature: { knowledge: Array<{ title: string; summary: string | null }>; monographs: Array<{ name: string }> };
  disclaimer: string;
};

export default function CdsPage() {
  const [complaint, setComplaint] = useState("Chest pain with hypertension history");
  const [meds, setMeds] = useState("lisinopril, ibuprofen");
  const [labText, setLabText] = useState("Troponin mildly elevated; creatinine 1.1");
  const [imagingNotes, setImagingNotes] = useState("Chest X-ray clear; consider ECG pathway");
  const [result, setResult] = useState<CdsResult | null>(null);
  const [history, setHistory] = useState<Array<{ id: string; chiefComplaint: string | null; createdAt: string }>>([]);
  const [error, setError] = useState("");
  const [role, setRole] = useState("");

  useEffect(() => {
    fetch("/api/auth")
      .then((r) => r.json())
      .then((d) => setRole(d.user?.role || ""));
    fetch("/api/cds")
      .then((r) => r.json())
      .then((d) => {
        if (d.sessions) setHistory(d.sessions);
      });
  }, []);

  return (
    <PageShell
      eyebrow="Clinical AI"
      title="AI medical decision support"
      description="Differential diagnosis · drug interactions · guidelines · risk prediction · lab interpretation · imaging assistance · documentation · literature search — assists clinicians; does not replace judgment."
    >
      {error && <p className="error-text">{error}</p>}
      <p className="muted" style={{ borderLeft: "3px solid #b45309", paddingLeft: "0.75rem" }}>
        This module assists healthcare professionals and does not replace their clinical judgment.
      </p>

      {!["DOCTOR", "NURSE", "ADMIN", "DEVELOPER", "HOSPITAL"].includes(role) && role && (
        <p className="error-text">Sign in as a clinician (e.g. doctor@medcare.local) to run CDS.</p>
      )}

      <form
        className="panel"
        style={{ marginBottom: "1rem" }}
        onSubmit={async (e: FormEvent) => {
          e.preventDefault();
          const res = await fetch("/api/cds", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "analyze",
              chiefComplaint: complaint,
              medications: meds.split(",").map((s) => s.trim()).filter(Boolean),
              labText,
              imagingNotes,
              patientEmail: "patient@medcare.local",
            }),
          });
          const d = await res.json();
          if (!res.ok) {
            setError(d.error || "CDS error");
            return;
          }
          setResult(d);
          setError("");
        }}
      >
        <h3 style={{ marginTop: 0 }}>Clinical case input</h3>
        <label className="label">Chief complaint</label>
        <textarea className="input" rows={2} value={complaint} onChange={(e) => setComplaint(e.target.value)} />
        <label className="label">Medications</label>
        <input className="input" value={meds} onChange={(e) => setMeds(e.target.value)} />
        <label className="label">Laboratory results</label>
        <textarea className="input" rows={2} value={labText} onChange={(e) => setLabText(e.target.value)} />
        <label className="label">Imaging notes</label>
        <textarea className="input" rows={2} value={imagingNotes} onChange={(e) => setImagingNotes(e.target.value)} />
        <button className="btn btn-primary form-submit" type="submit">
          Run decision support
        </button>
      </form>

      {result && (
        <div>
          <p className="muted">{result.disclaimer}</p>
          <div className="feature-grid">
            <div className="panel">
              <h3 style={{ marginTop: 0 }}>Differential diagnosis</h3>
              {result.differentials.map((d) => (
                <p key={d.dx}>
                  <strong>{d.dx}</strong> ({d.likelihood}) — {d.rationale}
                </p>
              ))}
            </div>
            <div className="panel">
              <h3 style={{ marginTop: 0 }}>Drug interaction alerts</h3>
              {result.interactions.length === 0 && <p className="muted">No alerts</p>}
              {result.interactions.map((a, i) => (
                <p key={i}>
                  <span className="badge">{a.severity}</span> {a.drugA} + {a.drugB}: {a.message}
                </p>
              ))}
            </div>
            <div className="panel">
              <h3 style={{ marginTop: 0 }}>Treatment guidelines</h3>
              {result.guidelines.map((g) => (
                <p key={g.title}>
                  <strong>{g.title}</strong> — {g.summary}
                </p>
              ))}
            </div>
            <div className="panel">
              <h3 style={{ marginTop: 0 }}>Risk prediction</h3>
              {result.risk.models.map((m) => (
                <p key={m.name}>
                  {m.name}: {m.score} ({m.band})
                </p>
              ))}
              <p className="muted">{result.risk.note}</p>
            </div>
            <div className="panel">
              <h3 style={{ marginTop: 0 }}>Laboratory interpretation</h3>
              <p>{result.labInterpretation.summary}</p>
              <p className="muted">{result.labInterpretation.flags.join(" · ")}</p>
              <p>{result.labInterpretation.advice}</p>
            </div>
            <div className="panel">
              <h3 style={{ marginTop: 0 }}>Imaging assistance</h3>
              <p>{result.imagingAssistance}</p>
            </div>
          </div>
          <div className="panel" style={{ marginTop: "1rem" }}>
            <h3 style={{ marginTop: 0 }}>Clinical documentation support</h3>
            <pre style={{ whiteSpace: "pre-wrap" }}>{result.documentationSupport}</pre>
          </div>
          <div className="panel" style={{ marginTop: "1rem" }}>
            <h3 style={{ marginTop: 0 }}>Medical literature search</h3>
            {result.literature.knowledge.map((k) => (
              <p key={k.title}>
                <strong>{k.title}</strong> — {k.summary}
              </p>
            ))}
            {result.literature.monographs.map((m) => (
              <p key={m.name} className="muted">
                Drug monograph: {m.name}
              </p>
            ))}
          </div>
        </div>
      )}

      {history.length > 0 && (
        <div style={{ marginTop: "1rem" }}>
          <h3>Recent CDS sessions</h3>
          {history.map((h) => (
            <p key={h.id} className="muted">
              {h.chiefComplaint} — {new Date(h.createdAt).toLocaleString()}
            </p>
          ))}
        </div>
      )}
    </PageShell>
  );
}
