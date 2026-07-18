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

export function AdminConsole() {
  const [features, setFeatures] = useState<Feature[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [subs, setSubs] = useState<Sub[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function load() {
    setError("");
    const [f, u, s] = await Promise.all([
      fetch("/api/features").then((r) => r.json()),
      fetch("/api/admin/users").then((r) => r.json()),
      fetch("/api/subscriptions").then((r) => r.json()),
    ]);
    if (f.error || u.error) {
      setError(f.error || u.error);
      return;
    }
    setFeatures(f.features || []);
    setUsers(u.users || []);
    setSubs(s.subscriptions || []);
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

  return (
    <>
      {error && <p style={{ color: "var(--danger)" }}>{error}</p>}
      {message && <p className="muted">{message}</p>}

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
      description="Manage users, subscriptions, and feature flags. Archive access is developer-only."
    >
      <AdminConsole />
    </PageShell>
  );
}
