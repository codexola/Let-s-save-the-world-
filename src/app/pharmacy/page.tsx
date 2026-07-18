"use client";

import { FormEvent, useEffect, useState } from "react";
import { RoleHomeShell } from "@/components/role-home-shell";
import { PageShell } from "@/components/page-shell";
import { ProfileForm } from "@/components/profile-form";
import { HistoryPanel } from "@/components/history-panel";
import { pharmacyProfileFields, personalProfileFields } from "@/lib/profile-fields";

type Prescription = {
  id: string;
  medication: string;
  dosage: string | null;
  status: string;
  issuedAt: string;
  patient?: { name: string };
  doctor?: { name: string };
};

type Medicine = {
  id: string;
  name: string;
  manufacturer: string | null;
  priceYen: number;
  stock: number;
  imageUrl: string | null;
  ingredients?: string | null;
  interactions?: string | null;
  warnings?: string | null;
  alternatives?: string | null;
};

const STATUSES = ["ISSUED", "APPROVED", "PREPARING", "READY", "DELIVERED", "EXPIRED"];

function PharmacyOwnerDashboard() {
  const [user, setUser] = useState<Record<string, unknown> | null>(null);
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
  const [editing, setEditing] = useState<Medicine | null>(null);
  const [form, setForm] = useState({
    name: "",
    manufacturer: "",
    priceYen: 0,
    stock: 0,
    imageUrl: "",
    ingredients: "",
    interactions: "",
    warnings: "",
    alternatives: "",
  });

  async function load() {
    const [profileRes, dashRes, rxRes] = await Promise.all([
      fetch("/api/profile"),
      fetch("/api/me/dashboard"),
      fetch("/api/pharmacy"),
    ]);
    const profile = await profileRes.json();
    const dash = await dashRes.json();
    const rx = await rxRes.json();
    setUser(profile.user);
    setMedicines((dash.medicines || []) as Medicine[]);
    setPrescriptions(rx.prescriptions || []);
  }

  useEffect(() => {
    load();
  }, []);

  async function saveMedicine(e: FormEvent) {
    e.preventDefault();
    await fetch("/api/profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "upsert_medicine",
        id: editing?.id,
        ...form,
      }),
    });
    setEditing(null);
    setForm({
      name: "",
      manufacturer: "",
      priceYen: 0,
      stock: 0,
      imageUrl: "",
      ingredients: "",
      interactions: "",
      warnings: "",
      alternatives: "",
    });
    load();
  }

  async function deleteMedicine(id: string) {
    await fetch("/api/profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete_medicine", id }),
    });
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

  const profile = (user?.pharmacyProfile as Record<string, unknown>) || {};

  return (
    <RoleHomeShell role="PHARMACY" title="Pharmacy management">
      <div style={{ marginTop: "1.25rem", display: "grid", gap: "1.25rem" }}>
        <ProfileForm
          title="Personal profile"
          action="update_profile"
          fields={personalProfileFields}
          initialValues={{
            name: user?.name,
            email: user?.email,
            phone: user?.phone,
            photoUrl: user?.photoUrl,
            bio: user?.bio,
          }}
          onSaved={load}
        />

        <ProfileForm
          title="Pharmacy profile"
          action="update_pharmacy"
          fields={pharmacyProfileFields}
          initialValues={profile}
          onSaved={load}
        />

        <form className="panel" onSubmit={saveMedicine}>
          <h2 className="section-title" style={{ marginTop: 0 }}>
            {editing ? "Edit medicine" : "Add medicine"}
          </h2>
          <label className="label">Name</label>
          <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          <label className="label">Manufacturer</label>
          <input className="input" value={form.manufacturer} onChange={(e) => setForm({ ...form, manufacturer: e.target.value })} />
          <label className="label">Ingredients</label>
          <input className="input" value={form.ingredients} onChange={(e) => setForm({ ...form, ingredients: e.target.value })} />
          <label className="label">Interactions</label>
          <input className="input" value={form.interactions} onChange={(e) => setForm({ ...form, interactions: e.target.value })} />
          <label className="label">Warnings</label>
          <input className="input" value={form.warnings} onChange={(e) => setForm({ ...form, warnings: e.target.value })} />
          <label className="label">Alternatives (comma-separated names)</label>
          <input className="input" value={form.alternatives} onChange={(e) => setForm({ ...form, alternatives: e.target.value })} />
          <label className="label">Price (¥)</label>
          <input className="input" type="number" value={form.priceYen} onChange={(e) => setForm({ ...form, priceYen: Number(e.target.value) })} />
          <label className="label">Stock</label>
          <input className="input" type="number" value={form.stock} onChange={(e) => setForm({ ...form, stock: Number(e.target.value) })} />
          <label className="label">Image URL</label>
          <input className="input" value={form.imageUrl} onChange={(e) => setForm({ ...form, imageUrl: e.target.value })} />
          <button className="btn btn-primary" type="submit" style={{ marginTop: "0.75rem" }}>
            {editing ? "Update" : "Add"}
          </button>
          {editing && (
            <button className="btn" type="button" style={{ marginLeft: "0.5rem" }} onClick={() => setEditing(null)}>
              Cancel
            </button>
          )}
        </form>

        <div className="panel">
          <h2 className="section-title" style={{ marginTop: 0 }}>
            Medicines inventory
          </h2>
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Manufacturer</th>
                <th>Price (¥)</th>
                <th>Stock</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {medicines.map((m) => (
                <tr key={m.id}>
                  <td>
                    {m.imageUrl && <img src={m.imageUrl} alt="" style={{ width: 32, height: 32, marginRight: 8, verticalAlign: "middle" }} />}
                    {m.name}
                  </td>
                  <td>{m.manufacturer || "—"}</td>
                  <td>{m.priceYen}</td>
                  <td>{m.stock}</td>
                  <td>
                    <span className="badge">{m.stock <= 10 ? "Low stock" : "In stock"}</span>
                  </td>
                  <td>
                    <button
                      className="btn"
                      type="button"
                      onClick={() => {
                        setEditing(m);
                        setForm({
                          name: m.name,
                          manufacturer: m.manufacturer || "",
                          priceYen: m.priceYen,
                          stock: m.stock,
                          imageUrl: m.imageUrl || "",
                          ingredients: m.ingredients || "",
                          interactions: m.interactions || "",
                          warnings: m.warnings || "",
                          alternatives: m.alternatives || "",
                        });
                      }}
                    >
                      Edit
                    </button>
                    <button className="btn" type="button" onClick={() => deleteMedicine(m.id)} style={{ marginLeft: 4 }}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {medicines.length === 0 && <p className="muted">No medicines in inventory.</p>}
        </div>

        <HistoryPanel
          title="Prescription queue"
          rows={prescriptions as unknown as Record<string, unknown>[]}
          columns={[
            { key: "medication", label: "Medication" },
            { key: "dosage", label: "Dosage" },
            {
              key: "patient",
              label: "Patient",
              render: (r) => {
                const p = r.patient as { name?: string } | undefined;
                return p?.name || "—";
              },
            },
            { key: "status", label: "Status", render: (r) => <span className="badge">{String(r.status)}</span> },
            {
              key: "update",
              label: "Update",
              render: (r) => (
                <select
                  className="input"
                  value={String(r.status)}
                  onChange={(e) => updateStatus(String(r.id), e.target.value)}
                >
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              ),
            },
          ]}
        />
      </div>
    </RoleHomeShell>
  );
}

function PharmacyPublicView() {
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
  const [pharmacies, setPharmacies] = useState<Array<{ id: string; name: string }>>([]);
  const [role, setRole] = useState("patient");
  const [patientId, setPatientId] = useState("");
  const [pharmacyId, setPharmacyId] = useState("");
  const [medication, setMedication] = useState("");
  const [dosage, setDosage] = useState("");
  const [message, setMessage] = useState("");

  async function load() {
    const [rxRes, phRes] = await Promise.all([
      fetch("/api/pharmacy"),
      fetch("/api/pharmacy?pharmacies=1"),
    ]);
    if (rxRes.ok) {
      const data = await rxRes.json();
      setPrescriptions(data.prescriptions || []);
      setRole(data.role || "patient");
    }
    if (phRes.ok) {
      const data = await phRes.json();
      setPharmacies((data.pharmacies || []).map((p: { id: string; name: string }) => ({ id: p.id, name: p.name })));
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function issueRx(e: FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/pharmacy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "issue", patientId, medication, dosage, pharmacyId: pharmacyId || undefined }),
    });
    const data = await res.json();
    setMessage(res.ok ? "Prescription issued & assigned to pharmacy" : data.error);
    load();
  }

  return (
    <PageShell
      eyebrow="Pharmacy"
      title="Prescription fulfillment"
      description="Doctors issue → patients receive → pharmacies fulfill. Statuses: Issued, Approved, Preparing, Ready, Delivered, Expired (auto)."
    >
      {message && <p className="muted">{message}</p>}

      {role === "doctor" && (
        <form className="panel" onSubmit={issueRx} style={{ marginBottom: "1.25rem" }}>
          <h2 style={{ marginTop: 0 }}>Issue prescription</h2>
          <label className="label">Patient user ID</label>
          <input className="input" value={patientId} onChange={(e) => setPatientId(e.target.value)} required />
          <label className="label">Fulfilling pharmacy</label>
          <select className="input" value={pharmacyId} onChange={(e) => setPharmacyId(e.target.value)}>
            <option value="">Default (first pharmacy)</option>
            {pharmacies.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <label className="label">Medication</label>
          <input className="input" value={medication} onChange={(e) => setMedication(e.target.value)} required />
          <label className="label">Dosage</label>
          <input className="input" value={dosage} onChange={(e) => setDosage(e.target.value)} />
          <button className="btn btn-primary form-submit" type="submit">
            Issue
          </button>
        </form>
      )}

      <HistoryPanel
        title={`Prescriptions (${role})`}
        rows={prescriptions as unknown as Record<string, unknown>[]}
        columns={[
          { key: "medication", label: "Medication" },
          { key: "dosage", label: "Dosage" },
          { key: "status", label: "Status", render: (r) => <span className="badge">{String(r.status)}</span> },
          {
            key: "patient",
            label: "Patient",
            render: (r) => {
              const p = r.patient as { name?: string } | undefined;
              return p?.name || "—";
            },
          },
          {
            key: "doctor",
            label: "Doctor",
            render: (r) => {
              const d = r.doctor as { name?: string } | undefined;
              return d?.name || "—";
            },
          },
          {
            key: "issuedAt",
            label: "Issued",
            render: (r) => new Date(String(r.issuedAt)).toLocaleDateString(),
          },
          {
            key: "expiresAt",
            label: "Expires",
            render: (r) => (r.expiresAt ? new Date(String(r.expiresAt)).toLocaleDateString() : "—"),
          },
        ]}
      />
    </PageShell>
  );
}

export default function PharmacyPage() {
  const [role, setRole] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/auth")
      .then((r) => r.json())
      .then((d) => setRole(d.user?.role || "PATIENT"));
  }, []);

  if (!role) return null;
  if (role === "PHARMACY") return <PharmacyOwnerDashboard />;
  return <PharmacyPublicView />;
}
