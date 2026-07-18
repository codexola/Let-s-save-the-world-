"use client";

import { FormEvent, useEffect, useState } from "react";
import { PageShell } from "@/components/page-shell";

type Lab = {
  id: string;
  name: string;
  accreditation: string | null;
  turnaroundHoursAvg: number;
  homeSampleCollection: boolean;
  operatingHours: string | null;
  pricingNotes: string | null;
  address: string | null;
};

type Test = {
  id: string;
  code: string;
  name: string;
  category: string;
  priceYen: number;
  turnaroundHours: number;
  homeCollection: boolean;
  description: string | null;
  laboratory?: { name: string } | null;
};

type Order = {
  id: string;
  testCode: string;
  testType: string;
  status: string;
  result: string | null;
  doctorNotes: string | null;
  priceYen: number;
  homeCollection: boolean;
  patient?: { name: string };
  doctor?: { name: string } | null;
  laboratory?: { name: string } | null;
};

const WORKFLOW = [
  "ordered",
  "sample_collected",
  "analyzing",
  "result_ready",
  "doctor_reviewed",
  "patient_notified",
];

export default function LaboratoryPage() {
  const [tab, setTab] = useState<"catalog" | "profiles" | "orders">("catalog");
  const [labs, setLabs] = useState<Lab[]>([]);
  const [tests, setTests] = useState<Test[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [category, setCategory] = useState("");
  const [orders, setOrders] = useState<Order[]>([]);
  const [patientId, setPatientId] = useState("");
  const [patientEmail, setPatientEmail] = useState("patient@medcare.local");
  const [testCode, setTestCode] = useState("CBC");
  const [homeCollection, setHomeCollection] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [role, setRole] = useState("");

  async function loadCatalog() {
    const params = new URLSearchParams({ action: "catalog" });
    if (category) params.set("category", category);
    const res = await fetch(`/api/laboratory?${params}`);
    const d = await res.json();
    setTests(d.tests || []);
    setLabs(d.laboratories || []);
    setCategories(d.categories || []);
  }

  async function loadOrders() {
    const res = await fetch("/api/laboratory");
    if (res.ok) {
      const d = await res.json();
      setOrders(d.orders || []);
    }
  }

  useEffect(() => {
    loadCatalog();
    loadOrders();
    fetch("/api/auth")
      .then((r) => r.json())
      .then((d) => {
        setRole(d.user?.role || "");
        if (d.user?.id && d.user.role === "PATIENT") setPatientId(d.user.id);
      });
  }, [category]);

  async function placeOrder(e: FormEvent) {
    e.preventDefault();
    setError("");
    const res = await fetch("/api/laboratory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "order",
        patientId: patientId || undefined,
        patientEmail: patientEmail || undefined,
        testCode,
        homeCollection,
      }),
    });
    const d = await res.json();
    if (!res.ok) {
      setError(d.error);
      return;
    }
    setMessage(`Order placed: ${d.order.testType}`);
    setTab("orders");
    loadOrders();
  }

  async function runAction(id: string, action: string, extra?: Record<string, unknown>) {
    const res = await fetch("/api/laboratory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, id, ...extra }),
    });
    const d = await res.json();
    setMessage(res.ok ? `Status → ${d.order.status}` : d.error);
    loadOrders();
  }

  return (
    <PageShell
      eyebrow="Laboratory & Diagnostics"
      title="Lab platform"
      description="Profiles · test catalog · doctor order → sample → analysis → digital result → doctor review → patient notification."
    >
      {error && <p className="error-text">{error}</p>}
      {message && <p className="muted">{message}</p>}

      <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", marginBottom: "1rem" }}>
        {(
          [
            ["catalog", "Test catalog"],
            ["profiles", "Laboratory profiles"],
            ["orders", "Orders & workflow"],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            className={tab === k ? "btn btn-primary" : "btn btn-ghost"}
            type="button"
            onClick={() => setTab(k)}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "catalog" && (
        <>
          <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap", marginBottom: "1rem" }}>
            <button className={!category ? "btn btn-primary" : "btn btn-ghost"} type="button" onClick={() => setCategory("")}>
              All
            </button>
            {categories.map((c) => (
              <button
                key={c}
                className={category === c ? "btn btn-primary" : "btn btn-ghost"}
                type="button"
                onClick={() => setCategory(c)}
              >
                {c.replace(/_/g, " ")}
              </button>
            ))}
          </div>
          <div className="feature-grid">
            {tests.map((t) => (
              <div key={t.id} className="panel">
                <p className="badge">{t.category.replace(/_/g, " ")}</p>
                <h3 style={{ marginTop: 0 }}>
                  {t.name} <span className="muted">({t.code})</span>
                </h3>
                <p className="muted">{t.description}</p>
                <p>
                  ¥{t.priceYen.toLocaleString()} · ~{t.turnaroundHours}h
                  {t.homeCollection ? " · Home collection" : ""}
                </p>
                <button
                  className="btn"
                  type="button"
                  onClick={() => {
                    setTestCode(t.code);
                    setHomeCollection(t.homeCollection);
                    setTab("orders");
                  }}
                >
                  Select for order
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      {tab === "profiles" && (
        <div className="feature-grid">
          {labs.map((lab) => (
            <div key={lab.id} className="panel">
              <h3 style={{ marginTop: 0 }}>{lab.name}</h3>
              <p className="badge">Accreditation</p>
              <p>{lab.accreditation || "—"}</p>
              <p className="muted">
                Avg TAT {lab.turnaroundHoursAvg}h · Hours: {lab.operatingHours || "—"}
              </p>
              <p className="muted">{lab.address}</p>
              <p>{lab.homeSampleCollection ? "Home sample collection available" : "In-lab collection only"}</p>
              <p className="muted">{lab.pricingNotes}</p>
            </div>
          ))}
        </div>
      )}

      {tab === "orders" && (
        <>
          {["DOCTOR", "ADMIN", "DEVELOPER"].includes(role) && (
            <form className="panel form-narrow" onSubmit={placeOrder} style={{ marginBottom: "1.25rem" }}>
              <h2 style={{ marginTop: 0 }}>Doctor → Laboratory order</h2>
              <label className="label">Patient email</label>
              <input
                className="input"
                type="email"
                value={patientEmail}
                onChange={(e) => setPatientEmail(e.target.value)}
                placeholder="patient@medcare.local"
                required
              />
              <label className="label">Test code</label>
              <input className="input" value={testCode} onChange={(e) => setTestCode(e.target.value)} required />
              <label style={{ display: "flex", gap: "0.4rem", alignItems: "center", marginTop: "0.5rem" }}>
                <input type="checkbox" checked={homeCollection} onChange={(e) => setHomeCollection(e.target.checked)} />
                Home sample collection
              </label>
              <button className="btn btn-primary form-submit" type="submit">
                Place order
              </button>
            </form>
          )}

          <div className="panel" style={{ marginBottom: "1rem" }}>
            <h3 style={{ marginTop: 0 }}>Workflow</h3>
            <p className="muted">{WORKFLOW.join(" → ")}</p>
          </div>

          {orders.map((o) => (
            <div key={o.id} className="panel" style={{ marginBottom: "0.75rem" }}>
              <h3 style={{ marginTop: 0 }}>
                {o.testType} <span className="badge">{o.status}</span>
              </h3>
              <p className="muted">
                {o.testCode} · ¥{o.priceYen.toLocaleString()} · {o.patient?.name} · Dr. {o.doctor?.name || "—"} ·{" "}
                {o.laboratory?.name || "Lab"}
                {o.homeCollection ? " · Home collection" : ""}
              </p>
              {o.result && <pre style={{ whiteSpace: "pre-wrap", fontSize: "0.85rem" }}>{o.result}</pre>}
              {o.doctorNotes && <p className="muted">Doctor: {o.doctorNotes}</p>}
              <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap" }}>
                {o.status === "ordered" && (
                  <button className="btn" type="button" onClick={() => runAction(o.id, "collect")}>
                    Sample collected
                  </button>
                )}
                {(o.status === "sample_collected" || o.status === "analyzing") && (
                  <button className="btn" type="button" onClick={() => runAction(o.id, "analyze")}>
                    Run analysis → digital result
                  </button>
                )}
                {o.status === "result_ready" && ["DOCTOR", "ADMIN", "DEVELOPER"].includes(role) && (
                  <button
                    className="btn btn-primary"
                    type="button"
                    onClick={() =>
                      runAction(o.id, "review", {
                        doctorNotes: "Reviewed — clinically correlated; patient counseling advised.",
                      })
                    }
                  >
                    Doctor review
                  </button>
                )}
                {o.status === "doctor_reviewed" && (
                  <button className="btn btn-primary" type="button" onClick={() => runAction(o.id, "notify_patient")}>
                    Notify patient
                  </button>
                )}
              </div>
            </div>
          ))}
          {orders.length === 0 && <p className="muted">No lab orders yet.</p>}
        </>
      )}
    </PageShell>
  );
}
