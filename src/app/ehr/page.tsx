"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { PageShell } from "@/components/page-shell";

const LABELS: Record<string, string> = {
  personalInfo: "Personal information",
  medicalHistory: "Medical history",
  diagnoses: "Diagnoses",
  treatments: "Treatments",
  operations: "Operations",
  labResults: "Laboratory results",
  imaging: "Imaging",
  vaccinations: "Vaccinations",
  allergies: "Allergies",
  medications: "Medications",
  prescriptions: "Prescriptions",
  familyHistory: "Family history",
  lifestyle: "Lifestyle",
  exercise: "Exercise",
  smoking: "Smoking",
  alcohol: "Alcohol",
  mentalHealth: "Mental health",
  dentalHistory: "Dental history",
  pregnancyHistory: "Pregnancy history",
  genetics: "Genetics",
  insurance: "Insurance",
  emergencyContacts: "Emergency contacts",
};

type Ehr = Record<string, string | null | undefined> & {
  linked?: {
    prescriptions?: unknown[];
    labOrders?: unknown[];
    images?: Array<{ id: string; modality: string; title: string }>;
    recentMetrics?: unknown[];
  };
};

export default function EhrPage() {
  const [sections, setSections] = useState<string[]>(Object.keys(LABELS));
  const [ehr, setEhr] = useState<Ehr | null>(null);
  const [edit, setEdit] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function load() {
    const res = await fetch("/api/ehr");
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Sign in required");
      return;
    }
    setEhr(data.ehr);
    if (data.sections?.length) setSections(data.sections);
    const next: Record<string, string> = {};
    for (const k of data.sections || Object.keys(LABELS)) {
      const v = data.ehr?.[k];
      next[k] = typeof v === "string" ? v : v ? JSON.stringify(v, null, 2) : "";
    }
    setForm(next);
  }

  useEffect(() => {
    load();
  }, []);

  async function save(e: FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/ehr", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const d = await res.json();
    if (!res.ok) {
      setError(d.error);
      return;
    }
    setEhr(d.ehr);
    setEdit(false);
    setMessage("Lifelong EHR saved (access logged)");
  }

  return (
    <PageShell
      eyebrow="Records"
      title="Electronic health record"
      description="Lifelong health record — personal info through genetics, insurance, and emergency contacts. Linked labs, imaging, prescriptions, and metrics."
    >
      {error && <p className="error-text">{error}</p>}
      {message && <p className="muted">{message}</p>}

      <p className="muted">
        Privacy export: <Link href="/privacy">Privacy & Consent</Link> · Imaging: <Link href="/imaging">Imaging</Link> ·
        Wearables: <Link href="/wearables">Wearables</Link> · RPM: <Link href="/rpm">Remote monitoring</Link>
      </p>

      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "1rem" }}>
        <button className="btn btn-primary" type="button" onClick={() => setEdit((v) => !v)}>
          {edit ? "Cancel edit" : "Edit record"}
        </button>
        <button
          className="btn"
          type="button"
          onClick={async () => {
            const res = await fetch("/api/privacy?action=export");
            const d = await res.json();
            if (!res.ok) {
              setError(d.error);
              return;
            }
            const blob = new Blob([JSON.stringify(d.export, null, 2)], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `ehr-export-${Date.now()}.json`;
            a.click();
            setMessage("Consent-gated export downloaded");
          }}
        >
          Consent-gated export
        </button>
      </div>

      {edit ? (
        <form className="panel" onSubmit={save}>
          {sections.map((key) => (
            <div key={key} style={{ marginBottom: "0.75rem" }}>
              <label className="label">{LABELS[key] || key}</label>
              <textarea
                className="input"
                rows={key === "personalInfo" || key === "medicalHistory" ? 3 : 2}
                value={form[key] || ""}
                onChange={(e) => setForm({ ...form, [key]: e.target.value })}
              />
            </div>
          ))}
          <button className="btn btn-primary form-submit" type="submit">
            Save lifelong record
          </button>
        </form>
      ) : ehr ? (
        <div className="feature-grid">
          {sections.map((key) => (
            <div key={key} className="panel">
              <p className="badge">{LABELS[key] || key}</p>
              <p style={{ whiteSpace: "pre-wrap" }}>
                {typeof ehr[key] === "string" ? ehr[key] || "—" : ehr[key] ? JSON.stringify(ehr[key], null, 2) : "—"}
              </p>
            </div>
          ))}
        </div>
      ) : (
        !error && <p className="muted">Loading lifelong record…</p>
      )}

      {ehr?.linked?.images && ehr.linked.images.length > 0 && (
        <div className="panel" style={{ marginTop: "1rem" }}>
          <h3 style={{ marginTop: 0 }}>Linked imaging studies</h3>
          <ul>
            {ehr.linked.images.map((i) => (
              <li key={i.id}>
                <Link href="/imaging">
                  {i.modality}: {i.title}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </PageShell>
  );
}
