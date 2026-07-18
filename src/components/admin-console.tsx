"use client";

import { useEffect, useState } from "react";
import { PageShell } from "./page-shell";

type Feature = {
  id: string;
  key: string;
  name: string;
  description: string;
  enabled: boolean;
  category: string;
};

type UserRow = {
  id: string;
  email: string;
  name: string;
  role: string;
  active: boolean;
  verified: boolean;
  photoUrl?: string | null;
};

type Sub = {
  id: string;
  plan: string;
  status: string;
  paid: boolean;
  adminGranted: boolean;
  user: { email: string; name: string };
  registrationCode?: { code: string } | null;
};

type Ticket = {
  id: string;
  name: string;
  email: string;
  subject: string;
  body: string;
  status: string;
  createdAt: string;
};

export function AdminConsole() {
  const [features, setFeatures] = useState<Feature[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [subs, setSubs] = useState<Sub[]>([]);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function load() {
    setError("");
    const [f, u, s, sup] = await Promise.all([
      fetch("/api/features").then((r) => r.json()),
      fetch("/api/admin/users").then((r) => r.json()),
      fetch("/api/subscriptions").then((r) => r.json()),
      fetch("/api/support").then((r) => r.json()),
    ]);
    if (f.error || u.error) {
      setError(f.error || u.error);
      return;
    }
    setFeatures(f.features || []);
    setUsers(u.users || []);
    setSubs(s.subscriptions || []);
    setTickets(sup.tickets || []);
  }

  useEffect(() => {
    load();
  }, []);

  async function toggleFeature(id: string, enabled: boolean) {
    const res = await fetch("/api/features", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "toggle", id, enabled }),
    });
    const data = await res.json();
    setMessage(res.ok ? `Feature ${data.feature.key} updated` : data.error);
    load();
  }

  async function grantSub(id: string) {
    const res = await fetch("/api/subscriptions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "admin_grant", subscriptionId: id }),
    });
    const data = await res.json();
    setMessage(res.ok ? "Subscription granted" : data.error);
    load();
  }

  async function toggleUserActive(userId: string, active: boolean) {
    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "set_active", userId, active }),
    });
    const data = await res.json();
    setMessage(res.ok ? `User ${active ? "activated" : "deactivated"}` : data.error);
    load();
  }

  async function verifyDoctor(userId: string) {
    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "verify_doctor", userId }),
    });
    const data = await res.json();
    setMessage(res.ok ? "Doctor verified" : data.error);
    load();
  }

  return (
    <>
      {error && <p style={{ color: "var(--danger)" }}>{error}</p>}
      {message && <p className="muted">{message}</p>}

      <div className="panel" style={{ marginBottom: "1.25rem" }}>
        <h2 style={{ marginTop: 0 }}>Support ticket inbox</h2>
        <table className="table">
          <thead>
            <tr>
              <th>From</th>
              <th>Subject</th>
              <th>Status</th>
              <th>Date</th>
            </tr>
          </thead>
          <tbody>
            {tickets.slice(0, 20).map((t) => (
              <tr key={t.id}>
                <td>
                  {t.name}
                  <div className="muted" style={{ fontSize: "0.78rem" }}>{t.email}</div>
                </td>
                <td>{t.subject}</td>
                <td><span className="badge">{t.status}</span></td>
                <td>{new Date(t.createdAt).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {tickets.length === 0 && <p className="muted">No tickets.</p>}
      </div>

      <div className="panel" style={{ marginBottom: "1.25rem" }}>
        <h2 style={{ marginTop: 0 }}>Feature flags</h2>
        <table className="table">
          <thead>
            <tr>
              <th>Module</th>
              <th>Category</th>
              <th>On</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {features.map((f) => (
              <tr key={f.id}>
                <td>
                  <strong>{f.name}</strong>
                  <div className="muted" style={{ fontSize: "0.78rem" }}>
                    {f.description}
                  </div>
                </td>
                <td>{f.category}</td>
                <td>{f.enabled ? "Yes" : "No"}</td>
                <td>
                  <button
                    className={`toggle ${f.enabled ? "on" : ""}`}
                    type="button"
                    aria-label={`Toggle ${f.name}`}
                    onClick={() => toggleFeature(f.id, !f.enabled)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="panel" style={{ marginBottom: "1.25rem" }}>
        <h2 style={{ marginTop: 0 }}>Subscriptions</h2>
        <table className="table">
          <thead>
            <tr>
              <th>User</th>
              <th>Plan</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {subs.map((s) => (
              <tr key={s.id}>
                <td>
                  {s.user.name}
                  <div className="muted" style={{ fontSize: "0.78rem" }}>
                    {s.user.email}
                  </div>
                </td>
                <td>{s.plan}</td>
                <td>{s.status}</td>
                <td>
                  {s.status !== "ACTIVE" && s.status !== "ADMIN_GRANTED" && (
                    <button className="btn btn-primary" type="button" onClick={() => grantSub(s.id)}>
                      Grant
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="panel">
        <h2 style={{ marginTop: 0 }}>Users</h2>
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Active</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>
                  <span style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    {u.photoUrl && <img src={u.photoUrl} alt="" className="avatar-sm" />}
                    {u.name}
                  </span>
                </td>
                <td>{u.email}</td>
                <td>{u.role}</td>
                <td>{u.active ? "Yes" : "No"}</td>
                <td style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap" }}>
                  <button
                    className="btn btn-ghost"
                    type="button"
                    onClick={() => toggleUserActive(u.id, !u.active)}
                  >
                    {u.active ? "Deactivate" : "Activate"}
                  </button>
                  {u.role === "DOCTOR" && !u.verified && (
                    <button className="btn btn-primary" type="button" onClick={() => verifyDoctor(u.id)}>
                      Verify doctor
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

export function AdminConsolePage() {
  return (
    <PageShell
      eyebrow="Administration"
      title="Admin control center"
      description="Manage users, subscriptions, support tickets, and feature flags."
    >
      <AdminConsole />
    </PageShell>
  );
}
