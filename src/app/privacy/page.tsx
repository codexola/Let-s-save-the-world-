"use client";

import { useEffect, useState } from "react";
import { PageShell } from "@/components/page-shell";

type ConsentRow = {
  type: string;
  granted: boolean;
  purpose: string | null;
  version: string;
  withdrawnAt: string | null;
  legalBasis?: string | null;
};

type CatalogItem = {
  type: string;
  purpose: string;
  legalBasis: string;
  required: boolean;
};

export default function PrivacyPage() {
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [current, setCurrent] = useState<ConsentRow[]>([]);
  const [policyVersion, setPolicyVersion] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [exportPreview, setExportPreview] = useState("");

  async function load() {
    const res = await fetch("/api/privacy?action=consents");
    const data = await res.json();
    if (!res.ok) {
      setError(data.error);
      return;
    }
    setCatalog(data.catalog || []);
    setCurrent(data.current || []);
    setPolicyVersion(data.policyVersion || "");
  }

  useEffect(() => {
    load();
  }, []);

  function isGranted(type: string) {
    const row = current.find((c) => c.type === type);
    return Boolean(row?.granted && !row.withdrawnAt);
  }

  async function toggleConsent(type: string, granted: boolean) {
    const res = await fetch("/api/privacy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "set_consent", type, granted }),
    });
    const data = await res.json();
    setMessage(res.ok ? `Consent ${type} ${granted ? "granted" : "withdrawn"}` : data.error);
    load();
  }

  return (
    <PageShell
      eyebrow="Compliance"
      title="Privacy & consent"
      description="APPI · HIPAA-aligned · GDPR — explicit consent, retention-aware controls, export, and erasure."
    >
      {error && <p className="error-text">{error}</p>}
      {message && <p className="muted">{message}</p>}

      <div className="panel" style={{ marginBottom: "1rem" }}>
        <p className="badge">Policy version {policyVersion || "—"}</p>
        <p className="muted">
          MedCare processes health information under Japan APPI, with controls aligned to HIPAA (US) and GDPR (EU)
          where those regimes apply. You control purpose-based consents below.
        </p>
        <button
          className="btn btn-primary"
          type="button"
          onClick={async () => {
            const res = await fetch("/api/privacy", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action: "accept_required" }),
            });
            const d = await res.json();
            setMessage(res.ok ? d.message : d.error);
            load();
          }}
        >
          Accept required consents
        </button>
      </div>

      <div className="panel" style={{ marginBottom: "1.25rem" }}>
        <h2 style={{ marginTop: 0 }}>Explicit consent management</h2>
        {catalog.map((c) => (
          <div
            key={c.type}
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: "1rem",
              flexWrap: "wrap",
              marginBottom: "0.85rem",
              paddingBottom: "0.85rem",
              borderBottom: "1px solid var(--border, #ddd)",
            }}
          >
            <div>
              <strong>{c.type}</strong> {c.required && <span className="badge">required</span>}
              <p className="muted" style={{ margin: "0.25rem 0" }}>
                {c.purpose}
              </p>
              <p className="muted" style={{ fontSize: "0.8rem" }}>
                Legal basis: {c.legalBasis} · Status: {isGranted(c.type) ? "Granted" : "Not granted"}
              </p>
            </div>
            <div style={{ display: "flex", gap: "0.35rem" }}>
              <button className="btn btn-primary" type="button" onClick={() => toggleConsent(c.type, true)}>
                Grant
              </button>
              <button className="btn btn-ghost" type="button" onClick={() => toggleConsent(c.type, false)}>
                Withdraw
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="feature-grid">
        <div className="panel">
          <h3 style={{ marginTop: 0 }}>Patient data export</h3>
          <p className="muted">Portability package (profile, EHR, appointments, chat, invoices, consents).</p>
          <button
            className="btn btn-primary"
            type="button"
            onClick={async () => {
              const res = await fetch("/api/privacy?action=export");
              const d = await res.json();
              if (!res.ok) {
                setError(d.error);
                return;
              }
              const text = JSON.stringify(d.export, null, 2);
              setExportPreview(text.slice(0, 4000) + (text.length > 4000 ? "\n…" : ""));
              const blob = new Blob([text], { type: "application/json" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = `medcare-export-${Date.now()}.json`;
              a.click();
              setMessage("Export downloaded");
            }}
          >
            Download my data
          </button>
          {exportPreview && (
            <pre style={{ whiteSpace: "pre-wrap", fontSize: "0.75rem", marginTop: "0.75rem", maxHeight: 240, overflow: "auto" }}>
              {exportPreview}
            </pre>
          )}
        </div>

        <div className="panel">
          <h3 style={{ marginTop: 0 }}>Right to delete</h3>
          <p className="muted">
            Where legally applicable, anonymize PHI and deactivate your account. Billing aggregates may be retained per
            retention policy.
          </p>
          <button
            className="btn"
            type="button"
            onClick={async () => {
              if (!confirm("Permanently erase/anonymize your account data?")) return;
              const res = await fetch("/api/privacy", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "erase", confirm: "DELETE" }),
              });
              const d = await res.json();
              setMessage(res.ok ? "Account data erased / anonymized" : d.error);
            }}
          >
            Erase my data
          </button>
        </div>

        <div className="panel">
          <h3 style={{ marginTop: 0 }}>Data subject request</h3>
          <button
            className="btn"
            type="button"
            onClick={async () => {
              const res = await fetch("/api/privacy", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  action: "request",
                  type: "access",
                  details: "Please provide a formal access report",
                }),
              });
              const d = await res.json();
              setMessage(res.ok ? `Request ${d.request.id} opened` : d.error);
            }}
          >
            Open access request
          </button>
        </div>
      </div>
    </PageShell>
  );
}
