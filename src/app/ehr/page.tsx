"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PageShell } from "@/components/page-shell";

type Ehr = {
  diagnoses: string | null;
  treatments: string | null;
  operations: string | null;
  labResults: string | null;
  imaging: string | null;
  vaccinations: string | null;
  familyHistory: string | null;
  lifestyle: string | null;
  genetics: string | null;
};

export default function EhrPage() {
  const [ehr, setEhr] = useState<Ehr | null>(null);
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
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <PageShell
      eyebrow="Records"
      title="Electronic health record"
      description="Lifelong record with consent-gated export. Access is logged for compliance."
    >
      {error && <p className="error-text">{error}</p>}
      {message && <p className="muted">{message}</p>}

      <p className="muted">
        Manage consents and download your data from <Link href="/privacy">Privacy</Link>.
      </p>

      {ehr ? (
        <div className="feature-grid">
          {(
            [
              ["diagnoses", "Diagnoses"],
              ["treatments", "Treatments"],
              ["operations", "Operations"],
              ["labResults", "Lab results"],
              ["imaging", "Imaging"],
              ["vaccinations", "Vaccinations"],
              ["familyHistory", "Family history"],
              ["lifestyle", "Lifestyle"],
              ["genetics", "Genetics"],
            ] as const
          ).map(([key, label]) => (
            <div key={key} className="panel">
              <p className="badge">{label}</p>
              <p style={{ whiteSpace: "pre-wrap" }}>{ehr[key] || "—"}</p>
            </div>
          ))}
        </div>
      ) : (
        !error && <p className="muted">Loading record…</p>
      )}

      <button
        className="btn btn-primary"
        type="button"
        style={{ marginTop: "1rem" }}
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
          setMessage("Consent-gated export downloaded (access logged)");
        }}
      >
        Consent-gated export
      </button>
    </PageShell>
  );
}
