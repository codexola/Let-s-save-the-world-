"use client";

import { FormEvent, useEffect, useState } from "react";
import { PageShell } from "@/components/page-shell";

type Policy = {
  insurerName: string;
  planName: string | null;
  memberId: string;
  verified: boolean;
  cardCode: string;
  copayPercent: number;
  outOfPocketMaxYen: number;
};

type Claim = {
  id: string;
  claimNumber: string;
  serviceDesc: string;
  amountYen: number;
  coveredYen: number;
  patientPayYen: number;
  reimbursementYen: number;
  status: string;
};

export default function InsurancePage() {
  const [policy, setPolicy] = useState<Policy | null>(null);
  const [card, setCard] = useState<Record<string, unknown> | null>(null);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [preAuths, setPreAuths] = useState<Array<{ id: string; serviceDesc: string; status: string; authCode: string | null }>>([]);
  const [oop, setOop] = useState<{ spentYen: number; maxYen: number; remainingYen: number } | null>(null);
  const [estimate, setEstimate] = useState<Record<string, number> | null>(null);
  const [amount, setAmount] = useState("20000");
  const [serviceDesc, setServiceDesc] = useState("Outpatient consultation");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [cardLookup, setCardLookup] = useState("");

  async function load() {
    const res = await fetch("/api/insurance");
    const d = await res.json();
    if (!res.ok) {
      setError(d.error || "Sign in required");
      return;
    }
    setPolicy(d.policy);
    setCard(d.digitalCard);
    setClaims(d.claims || []);
    setPreAuths(d.preAuths || []);
    setOop(d.outOfPocket);
    setEstimate(d.sampleCopayEstimate);
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <PageShell
      eyebrow="Insurance"
      title="Health insurance platform"
      description="Verification · coverage check · claims · tracking · pre-authorization · digital card · out-of-pocket & co-pay estimates · reimbursement tracking."
    >
      {error && <p className="error-text">{error}</p>}
      {message && <p className="muted">{message}</p>}

      <div className="panel" style={{ marginBottom: "1rem" }}>
        <h2 style={{ marginTop: 0 }}>Digital insurance card</h2>
        {card && (
          <>
            <p className="font-display" style={{ fontSize: "1.6rem", margin: 0 }}>
              {String(card.cardCode)}
            </p>
            <p>
              {String(card.insurerName)} · {String(card.planName)} · Member {String(card.memberId)}
            </p>
            <p className="badge">{card.verified ? "Verified" : "Unverified"}</p>
          </>
        )}
        <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", marginTop: "0.75rem" }}>
          <button
            className="btn btn-primary"
            type="button"
            onClick={async () => {
              const res = await fetch("/api/insurance", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "verify" }),
              });
              const d = await res.json();
              if (!res.ok) setError(d.error);
              else {
                setMessage("Insurance verified");
                load();
              }
            }}
          >
            Verify insurance
          </button>
          <button
            className="btn"
            type="button"
            onClick={async () => {
              const res = await fetch("/api/insurance", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "coverage", service: "homeCare" }),
              });
              const d = await res.json();
              setMessage(d.covered ? "Coverage check: covered for home care" : "Not covered");
            }}
          >
            Coverage check
          </button>
        </div>
      </div>

      <div className="feature-grid" style={{ marginBottom: "1rem" }}>
        <div className="panel">
          <p className="badge">Out-of-pocket</p>
          <p>
            Spent ¥{oop?.spentYen?.toLocaleString() || 0} / max ¥{oop?.maxYen?.toLocaleString() || 0}
          </p>
          <p className="muted">Remaining ¥{oop?.remainingYen?.toLocaleString() || 0}</p>
        </div>
        <div className="panel">
          <p className="badge">Co-pay estimate (sample ¥20k)</p>
          <p>Your share ¥{estimate?.patientPayYen?.toLocaleString() || "—"}</p>
          <p className="muted">Covered ¥{estimate?.coveredYen?.toLocaleString() || "—"} · {policy?.copayPercent}% copay</p>
        </div>
      </div>

      <form
        className="panel form-narrow"
        style={{ marginBottom: "1rem" }}
        onSubmit={async (e: FormEvent) => {
          e.preventDefault();
          const est = await fetch("/api/insurance", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "estimate", amountYen: Number(amount) }),
          });
          const ed = await est.json();
          setEstimate(ed.estimate);
          const res = await fetch("/api/insurance", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "submit_claim",
              serviceDesc,
              amountYen: Number(amount),
            }),
          });
          const d = await res.json();
          if (!res.ok) setError(d.error);
          else {
            setMessage(`Claim ${d.claim.claimNumber} submitted`);
            load();
          }
        }}
      >
        <h3 style={{ marginTop: 0 }}>Submit claim + estimate</h3>
        <input className="input" value={serviceDesc} onChange={(e) => setServiceDesc(e.target.value)} />
        <input className="input" value={amount} onChange={(e) => setAmount(e.target.value)} type="number" />
        <button className="btn btn-primary form-submit" type="submit">
          Submit claim
        </button>
      </form>

      <button
        className="btn"
        type="button"
        style={{ marginBottom: "1rem" }}
        onClick={async () => {
          const res = await fetch("/api/insurance", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "preauth",
              serviceDesc: "MRI lumbar spine",
              amountYen: 45000,
            }),
          });
          const d = await res.json();
          if (!res.ok) setError(d.error);
          else {
            setMessage(`Pre-auth ${d.preAuth.authCode} (${d.preAuth.status})`);
            load();
          }
        }}
      >
        Request pre-authorization
      </button>

      <h3>Claim tracking</h3>
      {claims.map((c) => (
        <div key={c.id} className="panel" style={{ marginBottom: "0.5rem" }}>
          <strong>
            {c.claimNumber} <span className="badge">{c.status}</span>
          </strong>
          <p className="muted">
            {c.serviceDesc} · billed ¥{c.amountYen.toLocaleString()} · covered ¥{c.coveredYen.toLocaleString()} ·
            you ¥{c.patientPayYen.toLocaleString()} · reimbursed ¥{c.reimbursementYen.toLocaleString()}
          </p>
          <div style={{ display: "flex", gap: "0.35rem" }}>
            {c.status === "submitted" && (
              <button
                className="btn"
                type="button"
                onClick={async () => {
                  await fetch("/api/insurance", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ action: "advance_claim", id: c.id, status: "approved" }),
                  });
                  load();
                }}
              >
                Mark approved
              </button>
            )}
            {c.status === "approved" && (
              <button
                className="btn btn-primary"
                type="button"
                onClick={async () => {
                  await fetch("/api/insurance", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ action: "mark_reimbursed", id: c.id }),
                  });
                  load();
                }}
              >
                Track reimbursement (paid)
              </button>
            )}
          </div>
        </div>
      ))}

      <h3>Pre-authorizations</h3>
      {preAuths.map((p) => (
        <p key={p.id}>
          {p.serviceDesc} — {p.status} {p.authCode || ""}
        </p>
      ))}

      <form
        className="panel form-narrow"
        onSubmit={async (e) => {
          e.preventDefault();
          const res = await fetch(`/api/insurance?action=card&code=${encodeURIComponent(cardLookup)}`);
          const d = await res.json();
          setMessage(res.ok ? `Card OK: ${d.card.patientName} / ${d.card.insurerName}` : d.error);
        }}
      >
        <h3 style={{ marginTop: 0 }}>Lookup digital card</h3>
        <input className="input" value={cardLookup} onChange={(e) => setCardLookup(e.target.value)} placeholder="IC-..." />
        <button className="btn form-submit" type="submit">
          Lookup
        </button>
      </form>
    </PageShell>
  );
}
