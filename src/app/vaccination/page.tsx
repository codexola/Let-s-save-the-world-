"use client";

import { FormEvent, useEffect, useState } from "react";
import { PageShell } from "@/components/page-shell";

type RecordRow = {
  id: string;
  vaccineName: string;
  category: string;
  doseNumber: number;
  totalDoses: number;
  administeredAt: string | null;
  dueAt: string | null;
  boosterDueAt: string | null;
  status: string;
  provider: string | null;
  lotNumber: string | null;
};

type Cert = {
  id: string;
  publicCode: string;
  issuedAt: string;
  expiresAt: string | null;
  record: RecordRow;
};

type Campaign = { id: string; name: string; type: string; vaccineName: string; targetGroup: string | null };

export default function VaccinationPage() {
  const [tab, setTab] = useState<"history" | "upcoming" | "boosters" | "certs" | "campaigns">("history");
  const [history, setHistory] = useState<RecordRow[]>([]);
  const [upcoming, setUpcoming] = useState<RecordRow[]>([]);
  const [boosters, setBoosters] = useState<RecordRow[]>([]);
  const [certificates, setCertificates] = useState<Cert[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [travel, setTravel] = useState<RecordRow[]>([]);
  const [school, setSchool] = useState<RecordRow[]>([]);
  const [corporate, setCorporate] = useState<RecordRow[]>([]);
  const [catalog, setCatalog] = useState<Array<{ name: string; category: string }>>([]);
  const [vaccineName, setVaccineName] = useState("Influenza");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [lookupCode, setLookupCode] = useState("");
  const [lookupResult, setLookupResult] = useState("");

  async function load() {
    const res = await fetch("/api/vaccination");
    const d = await res.json();
    if (!res.ok) {
      setError(d.error || "Sign in required");
      return;
    }
    setHistory(d.history || []);
    setUpcoming(d.upcoming || []);
    setBoosters(d.boosterSchedule || []);
    setCertificates(d.certificates || []);
    setCampaigns(d.campaigns || []);
    setTravel(d.travel || []);
    setSchool(d.school || []);
    setCorporate(d.corporate || []);
    setCatalog(d.catalog || []);
    if (d.catalog?.[0]?.name) setVaccineName(d.catalog[0].name);
  }

  useEffect(() => {
    load();
  }, []);

  function listForTab() {
    if (tab === "history") return history;
    if (tab === "upcoming") return upcoming;
    if (tab === "boosters") return boosters;
    return [];
  }

  return (
    <PageShell
      eyebrow="Prevention"
      title="Vaccination management"
      description="History · upcoming · boosters · digital certificates · travel · corporate campaigns · school programs · reminders."
    >
      {error && <p className="error-text">{error}</p>}
      {message && <p className="muted">{message}</p>}

      <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap", marginBottom: "1rem" }}>
        {(
          [
            ["history", "History"],
            ["upcoming", "Upcoming"],
            ["boosters", "Booster schedule"],
            ["certs", "Digital certificates"],
            ["campaigns", "Campaigns"],
          ] as const
        ).map(([k, label]) => (
          <button key={k} className={tab === k ? "btn btn-primary" : "btn btn-ghost"} type="button" onClick={() => setTab(k)}>
            {label}
          </button>
        ))}
      </div>

      <form
        className="panel form-narrow"
        style={{ marginBottom: "1rem" }}
        onSubmit={async (e: FormEvent) => {
          e.preventDefault();
          const res = await fetch("/api/vaccination", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "record", vaccineName, provider: "MedCare Clinic" }),
          });
          const d = await res.json();
          if (!res.ok) setError(d.error);
          else {
            setMessage(`Recorded ${d.record.vaccineName}`);
            load();
          }
        }}
      >
        <h3 style={{ marginTop: 0 }}>Record vaccination</h3>
        <select className="input" value={vaccineName} onChange={(e) => setVaccineName(e.target.value)}>
          {catalog.map((v) => (
            <option key={v.name} value={v.name}>
              {v.name} ({v.category})
            </option>
          ))}
        </select>
        <button className="btn btn-primary form-submit" type="submit">
          Add completed dose
        </button>
      </form>

      <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", marginBottom: "1rem" }}>
        <button
          className="btn"
          type="button"
          onClick={async () => {
            const res = await fetch("/api/vaccination", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                action: "record",
                vaccineName: "Yellow Fever",
                category: "travel",
                upcoming: true,
                dueAt: new Date(Date.now() + 21 * 86400_000).toISOString(),
              }),
            });
            const d = await res.json();
            if (!res.ok) setError(d.error);
            else {
              setMessage("Travel vaccine scheduled");
              load();
            }
          }}
        >
          Schedule travel vaccine
        </button>
        <button
          className="btn"
          type="button"
          onClick={async () => {
            const res = await fetch("/api/vaccination", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action: "reminders" }),
            });
            const d = await res.json();
            setMessage(`Reminders sent: ${d.sent}`);
          }}
        >
          Run reminder system
        </button>
      </div>

      <div className="feature-grid" style={{ marginBottom: "1rem" }}>
        <div className="panel">
          <p className="badge">Travel vaccines</p>
          <p>{travel.length} records</p>
        </div>
        <div className="panel">
          <p className="badge">School vaccinations</p>
          <p>{school.length} records</p>
        </div>
        <div className="panel">
          <p className="badge">Corporate campaigns</p>
          <p>{corporate.length} records · {campaigns.length} campaigns</p>
        </div>
      </div>

      {(tab === "history" || tab === "upcoming" || tab === "boosters") && (
        <div>
          {listForTab().map((r) => (
            <div key={r.id} className="panel" style={{ marginBottom: "0.5rem" }}>
              <strong>
                {r.vaccineName} <span className="badge">{r.category}</span> {r.doseNumber}/{r.totalDoses}
              </strong>
              <p className="muted">
                Status {r.status}
                {r.administeredAt ? ` · given ${new Date(r.administeredAt).toLocaleDateString()}` : ""}
                {r.dueAt ? ` · due ${new Date(r.dueAt).toLocaleDateString()}` : ""}
                {r.boosterDueAt ? ` · booster ${new Date(r.boosterDueAt).toLocaleDateString()}` : ""}
                {r.provider ? ` · ${r.provider}` : ""}
                {r.lotNumber ? ` · lot ${r.lotNumber}` : ""}
              </p>
              {r.status === "completed" && (
                <button
                  className="btn"
                  type="button"
                  onClick={async () => {
                    const res = await fetch("/api/vaccination", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ action: "certificate", recordId: r.id }),
                    });
                    const d = await res.json();
                    if (!res.ok) setError(d.error);
                    else {
                      setMessage(`Certificate ${d.certificate.publicCode}`);
                      setTab("certs");
                      load();
                    }
                  }}
                >
                  Issue digital certificate
                </button>
              )}
            </div>
          ))}
          {listForTab().length === 0 && <p className="muted">No items.</p>}
        </div>
      )}

      {tab === "certs" && (
        <div>
          {certificates.map((c) => (
            <div key={c.id} className="panel" style={{ marginBottom: "0.5rem" }}>
              <p className="font-display" style={{ fontSize: "1.4rem", margin: 0 }}>
                {c.publicCode}
              </p>
              <p>
                {c.record.vaccineName} · issued {new Date(c.issuedAt).toLocaleDateString()}
                {c.expiresAt ? ` · expires ${new Date(c.expiresAt).toLocaleDateString()}` : ""}
              </p>
              <p className="muted">Verify: /api/vaccination?action=certificate&code={c.publicCode}</p>
            </div>
          ))}
          <form
            className="panel form-narrow"
            onSubmit={async (e) => {
              e.preventDefault();
              const res = await fetch(`/api/vaccination?action=certificate&code=${encodeURIComponent(lookupCode)}`);
              const d = await res.json();
              if (!res.ok) setLookupResult(d.error);
              else
                setLookupResult(
                  `${d.certificate.patientName} — ${d.certificate.vaccine} dose ${d.certificate.dose} (${d.certificate.publicCode})`
                );
            }}
          >
            <h3 style={{ marginTop: 0 }}>Verify certificate</h3>
            <input className="input" value={lookupCode} onChange={(e) => setLookupCode(e.target.value)} placeholder="VC-..." />
            <button className="btn btn-primary form-submit" type="submit">
              Lookup
            </button>
            {lookupResult && <p className="muted">{lookupResult}</p>}
          </form>
        </div>
      )}

      {tab === "campaigns" && (
        <div>
          {campaigns.map((c) => (
            <div key={c.id} className="panel" style={{ marginBottom: "0.5rem" }}>
              <strong>{c.name}</strong>
              <p className="muted">
                {c.type} · {c.vaccineName} · {c.targetGroup || "General"}
              </p>
            </div>
          ))}
        </div>
      )}
    </PageShell>
  );
}
