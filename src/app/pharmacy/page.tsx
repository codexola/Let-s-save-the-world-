"use client";

import { FormEvent, useEffect, useState } from "react";
import { PageShell } from "@/components/page-shell";

type Prescription = {
  id: string;
  medication: string;
  dosage: string | null;
  status: string;
  issuedAt: string;
  patient?: { id: string; name: string; email: string };
  doctor?: { name: string };
};

const STATUSES = ["ISSUED", "APPROVED", "PREPARING", "READY", "DELIVERED", "EXPIRED"];

export default function PharmacyPage() {
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
  const [role, setRole] = useState("patient");
  const [patientId, setPatientId] = useState("");
  const [medication, setMedication] = useState("");
  const [dosage, setDosage] = useState("");
  const [message, setMessage] = useState("");

  async function load() {
    const res = await fetch("/api/pharmacy");
    if (!res.ok) return;
    const data = await res.json();
    setPrescriptions(data.prescriptions || []);
    setRole(data.role || "patient");
  }

  useEffect(() => {
    load();
  }, []);

  async function issueRx(e: FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/pharmacy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "issue", patientId, medication, dosage }),
    });
    const data = await res.json();
    setMessage(res.ok ? "Prescription issued" : data.error);
    load();
  }

  async function updateStatus(id: string, status: string) {
    await fetch("/api/pharmacy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "update_status", id, status }),
    });
    load();
  }

  return (
    <PageShell
      eyebrow="Pharmacy"
      title="Prescription fulfillment"
      description="Track prescriptions and update fulfillment status."
    >
      {message && <p className="muted">{message}</p>}

      {role === "doctor" && (
        <form className="panel" onSubmit={issueRx} style={{ marginBottom: "1.25rem" }}>
          <h2 style={{ marginTop: 0 }}>Issue prescription</h2>
          <label className="label">Patient user ID</label>
          <input className="input" value={patientId} onChange={(e) => setPatientId(e.target.value)} required />
          <label className="label">Medication</label>
          <input className="input" value={medication} onChange={(e) => setMedication(e.target.value)} required />
          <label className="label">Dosage</label>
          <input className="input" value={dosage} onChange={(e) => setDosage(e.target.value)} />
          <button className="btn btn-primary form-submit" type="submit">Issue</button>
        </form>
      )}

      <div className="panel">
        <h2 style={{ marginTop: 0 }}>Prescriptions ({role})</h2>
        <table className="table">
          <thead>
            <tr>
              <th>Medication</th>
              <th>Status</th>
              <th>Patient</th>
              <th>Issued</th>
              {role === "pharmacy" && <th>Update</th>}
            </tr>
          </thead>
          <tbody>
            {prescriptions.map((p) => (
              <tr key={p.id}>
                <td>{p.medication} {p.dosage && `(${p.dosage})`}</td>
                <td><span className="badge">{p.status}</span></td>
                <td>{p.patient?.name || "—"}</td>
                <td>{new Date(p.issuedAt).toLocaleDateString()}</td>
                {role === "pharmacy" && (
                  <td>
                    <select
                      className="input"
                      value={p.status}
                      onChange={(e) => updateStatus(p.id, e.target.value)}
                    >
                      {STATUSES.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        {prescriptions.length === 0 && <p className="muted">No prescriptions.</p>}
      </div>
    </PageShell>
  );
}
