"use client";

import { FormEvent, useEffect, useState } from "react";
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
  const [auditLogs, setAuditLogs] = useState<Array<Record<string, unknown>>>([]);
  const [coupons, setCoupons] = useState<Array<Record<string, unknown>>>([]);
  const [complaints, setComplaints] = useState<Array<Record<string, unknown>>>([]);
  const [reviews, setReviews] = useState<Array<Record<string, unknown>>>([]);
  const [payments, setPayments] = useState<Array<Record<string, unknown>>>([]);
  const [security, setSecurity] = useState<Record<string, unknown> | null>(null);
  const [overview, setOverview] = useState<Record<string, number> | null>(null);
  const [analytics, setAnalytics] = useState<Record<string, number> | null>(null);
  const [tab, setTab] = useState("overview");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function load() {
    setError("");
    const [f, u, s, sup, panel] = await Promise.all([
      fetch("/api/features").then((r) => r.json()),
      fetch("/api/admin/users").then((r) => r.json()),
      fetch("/api/subscriptions").then((r) => r.json()),
      fetch("/api/support").then((r) => r.json()),
      fetch("/api/admin/panel").then((r) => r.json()),
    ]);
    if (f.error || u.error) {
      setError(f.error || u.error);
      return;
    }
    setFeatures(f.features || []);
    setUsers(u.users || []);
    setSubs(s.subscriptions || []);
    setTickets(sup.tickets || []);
    if (panel.overview) setOverview(panel.overview);
  }

  async function loadSection(section: string) {
    const res = await fetch(`/api/admin/panel?section=${section}`);
    const data = await res.json();
    if (!res.ok) {
      setError(data.error);
      return;
    }
    if (section === "audit") setAuditLogs(data.logs || []);
    if (section === "coupons") setCoupons(data.coupons || []);
    if (section === "complaints") setComplaints(data.complaints || []);
    if (section === "reviews") setReviews(data.reviews || []);
    if (section === "payments") setPayments(data.invoices || []);
    if (section === "security") setSecurity(data);
  }

  useEffect(() => {
    load();
    fetch("/api/analytics?scope=platform")
      .then((r) => r.json())
      .then((d) => {
        if (d.stats) setAnalytics(d.stats);
      });
  }, []);

  useEffect(() => {
    if (["audit", "coupons", "complaints", "reviews", "payments", "security"].includes(tab)) {
      loadSection(tab);
    }
  }, [tab]);

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

  async function verifyEntity(action: string, userId: string, label: string) {
    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, userId }),
    });
    const data = await res.json();
    setMessage(res.ok ? `${label} verified` : data.error);
    load();
  }

  async function approveHospital(userId: string) {
    const res = await fetch("/api/admin/panel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "approve_hospital", userId }),
    });
    const data = await res.json();
    setMessage(res.ok ? "Hospital approved" : data.error);
    load();
  }

  async function createCoupon(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const res = await fetch("/api/admin/panel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "create_coupon",
        code: fd.get("code"),
        description: fd.get("description"),
        discountPercent: Number(fd.get("percent")),
        discountYen: Number(fd.get("yen")),
        ambassadorOnly: fd.get("ambassador") === "on",
      }),
    });
    const data = await res.json();
    setMessage(res.ok ? `Coupon ${data.coupon.code} created` : data.error);
    loadSection("coupons");
  }

  const tabs = [
    "overview",
    "users",
    "subscriptions",
    "payments",
    "coupons",
    "support",
    "complaints",
    "reviews",
    "analytics",
    "audit",
    "security",
    "features",
  ];

  return (
    <>
      {error && <p style={{ color: "var(--danger)" }}>{error}</p>}
      {message && <p className="muted">{message}</p>}

      <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap", marginBottom: "1rem" }}>
        {tabs.map((t) => (
          <button
            key={t}
            className={tab === t ? "btn btn-primary" : "btn btn-ghost"}
            type="button"
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "overview" && overview && (
        <div className="feature-grid">
          {Object.entries(overview).map(([k, v]) => (
            <div key={k} className="panel">
              <p className="badge">{k}</p>
              <h3>{v}</h3>
            </div>
          ))}
        </div>
      )}

      {tab === "analytics" && analytics && (
        <div className="feature-grid">
          {Object.entries(analytics).map(([k, v]) => (
            <div key={k} className="panel">
              <p className="badge">{k}</p>
              <h3>{typeof v === "number" ? v.toLocaleString() : String(v)}</h3>
            </div>
          ))}
        </div>
      )}

      {tab === "support" && (
        <div className="panel">
          <h2 style={{ marginTop: 0 }}>Support tickets</h2>
          <table className="table">
            <thead>
              <tr>
                <th>From</th>
                <th>Subject</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {tickets.map((t) => (
                <tr key={t.id}>
                  <td>
                    {t.name}
                    <div className="muted" style={{ fontSize: "0.78rem" }}>
                      {t.email}
                    </div>
                  </td>
                  <td>{t.subject}</td>
                  <td>
                    <span className="badge">{t.status}</span>
                  </td>
                  <td>
                    {t.status === "open" && (
                      <button
                        className="btn btn-ghost"
                        type="button"
                        onClick={async () => {
                          await fetch("/api/admin/panel", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ action: "update_ticket", id: t.id, status: "resolved" }),
                          });
                          load();
                        }}
                      >
                        Resolve
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "features" && (
        <div className="panel">
          <h2 style={{ marginTop: 0 }}>Feature flags</h2>
          <table className="table">
            <thead>
              <tr>
                <th>Module</th>
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
                  <td>{f.enabled ? "Yes" : "No"}</td>
                  <td>
                    <button
                      className={`toggle ${f.enabled ? "on" : ""}`}
                      type="button"
                      onClick={() => toggleFeature(f.id, !f.enabled)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "subscriptions" && (
        <div className="panel">
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
      )}

      {tab === "users" && (
        <div className="panel">
          <h2 style={{ marginTop: 0 }}>User management · doctor verification · hospital approval</h2>
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Role</th>
                <th>Active</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>
                    {u.name}
                    <div className="muted" style={{ fontSize: "0.78rem" }}>
                      {u.email}
                    </div>
                  </td>
                  <td>
                    {u.role} {u.verified ? "✓" : ""}
                  </td>
                  <td>{u.active ? "Yes" : "No"}</td>
                  <td style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap" }}>
                    <button className="btn btn-ghost" type="button" onClick={() => toggleUserActive(u.id, !u.active)}>
                      {u.active ? "Deactivate" : "Activate"}
                    </button>
                    {u.role === "DOCTOR" && !u.verified && (
                      <button className="btn btn-primary" type="button" onClick={() => verifyDoctor(u.id)}>
                        Verify doctor
                      </button>
                    )}
                    {u.role === "HOSPITAL" && !u.verified && (
                      <>
                        <button
                          className="btn btn-primary"
                          type="button"
                          onClick={() => verifyEntity("verify_hospital", u.id, "Hospital")}
                        >
                          Verify
                        </button>
                        <button className="btn" type="button" onClick={() => approveHospital(u.id)}>
                          Approve hospital
                        </button>
                      </>
                    )}
                    {u.role === "COMPANY" && !u.verified && (
                      <button
                        className="btn btn-primary"
                        type="button"
                        onClick={() => verifyEntity("verify_company", u.id, "Company")}
                      >
                        Verify company
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "coupons" && (
        <>
          <form className="panel form-narrow" onSubmit={createCoupon} style={{ marginBottom: "1rem" }}>
            <h2 style={{ marginTop: 0 }}>Create coupon</h2>
            <input className="input" name="code" placeholder="CODE" required />
            <input className="input" name="description" placeholder="Description" />
            <input className="input" name="percent" type="number" placeholder="% off" />
            <input className="input" name="yen" type="number" placeholder="¥ off" />
            <label>
              <input type="checkbox" name="ambassador" /> Ambassador only
            </label>
            <button className="btn btn-primary" type="submit">
              Create
            </button>
          </form>
          <div className="panel">
            {coupons.map((c) => (
              <p key={String(c.id)} className="muted">
                <strong>{String(c.code)}</strong> — {String(c.description || "")} ({String(c.discountPercent)}% / ¥
                {String(c.discountYen)})
              </p>
            ))}
          </div>
        </>
      )}

      {tab === "complaints" && (
        <div className="panel">
          <h2 style={{ marginTop: 0 }}>Complaints</h2>
          {complaints.map((c) => (
            <div key={String(c.id)} style={{ marginBottom: "0.75rem" }}>
              <strong>{String(c.subject)}</strong> <span className="badge">{String(c.status)}</span>
              <p className="muted">{String(c.body)}</p>
              {c.status === "open" && (
                <button
                  className="btn btn-ghost"
                  type="button"
                  onClick={async () => {
                    await fetch("/api/admin/panel", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        action: "resolve_complaint",
                        id: c.id,
                        status: "resolved",
                        resolution: "Reviewed by admin",
                      }),
                    });
                    loadSection("complaints");
                  }}
                >
                  Resolve
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {tab === "reviews" && (
        <div className="panel">
          <h2 style={{ marginTop: 0 }}>Review moderation</h2>
          {reviews.map((r) => (
            <div key={String(r.id)} style={{ marginBottom: "0.5rem" }}>
              ★{String(r.rating)} {(r.author as { name?: string })?.name} — {String(r.comment || "")}
              {r.spamFlag ? <span className="badge">spam</span> : null}
              <button
                className="btn btn-ghost"
                type="button"
                onClick={async () => {
                  await fetch("/api/admin/panel", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ action: "moderate_review", id: r.id, spamFlag: !r.spamFlag }),
                  });
                  loadSection("reviews");
                }}
              >
                Toggle spam
              </button>
            </div>
          ))}
        </div>
      )}

      {tab === "payments" && (
        <div className="panel">
          <h2 style={{ marginTop: 0 }}>Payments / invoices</h2>
          <table className="table">
            <thead>
              <tr>
                <th>User</th>
                <th>Description</th>
                <th>Amount</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr key={String(p.id)}>
                  <td>{(p.user as { email?: string })?.email}</td>
                  <td>{String(p.description)}</td>
                  <td>¥{Number(p.amountYen).toLocaleString()}</td>
                  <td>{String(p.status)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "audit" && (
        <div className="panel">
          <h2 style={{ marginTop: 0 }}>Audit logs</h2>
          <table className="table">
            <thead>
              <tr>
                <th>When</th>
                <th>User</th>
                <th>Action</th>
                <th>Resource</th>
              </tr>
            </thead>
            <tbody>
              {auditLogs.map((l) => (
                <tr key={String(l.id)}>
                  <td>{new Date(String(l.createdAt)).toLocaleString()}</td>
                  <td>{(l.user as { email?: string } | null)?.email || "—"}</td>
                  <td>{String(l.action)}</td>
                  <td>
                    {String(l.resource)} {l.details ? `· ${String(l.details)}` : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "security" && security && (
        <div className="panel">
          <h2 style={{ marginTop: 0 }}>Security · backup · Zero Trust</h2>
          <pre style={{ whiteSpace: "pre-wrap", fontSize: "0.8rem" }}>
            {JSON.stringify(security.zeroTrust, null, 2)}
          </pre>
          <button
            className="btn btn-primary"
            type="button"
            onClick={async () => {
              const res = await fetch("/api/admin/panel", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "create_backup" }),
              });
              const d = await res.json();
              setMessage(res.ok ? `Backup ${d.backup.filename}` : d.error);
              loadSection("security");
            }}
          >
            Create DB backup
          </button>
          <h3>Backups</h3>
          {(security.backups as Array<{ filename: string; sizeBytes: number; createdAt: string }> | undefined)?.map(
            (b) => (
              <p key={b.filename} className="muted">
                {b.filename} — {(b.sizeBytes / 1024).toFixed(1)} KB — {new Date(b.createdAt).toLocaleString()}
              </p>
            )
          )}
          <h3>Intrusion / security events</h3>
          {(security.events as Array<{ type: string; severity: string; details: string | null; createdAt: string }> | undefined)?.map(
            (e, i) => (
              <p key={i} className="muted">
                [{e.severity}] {e.type} — {e.details} — {new Date(e.createdAt).toLocaleString()}
              </p>
            )
          )}
        </div>
      )}
    </>
  );
}

export function AdminConsolePage() {
  return (
    <PageShell
      eyebrow="Administration"
      title="Admin control center"
      description="Users · doctor verification · hospital approval · reports · complaints · reviews · subscriptions · payments · coupons · support · analytics · audit logs."
    >
      <AdminConsole />
    </PageShell>
  );
}
