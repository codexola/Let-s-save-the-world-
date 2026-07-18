"use client";

import { FormEvent, useEffect, useState } from "react";
import { PageShell } from "@/components/page-shell";

type Notification = {
  id: string;
  email: string;
  subject: string;
  body: string;
  channel: string;
  kind?: string;
  read: boolean;
  createdAt: string;
};

type Prefs = {
  emailEnabled: boolean;
  smsEnabled: boolean;
  pushEnabled: boolean;
  lineEnabled: boolean;
  appointmentReminders: boolean;
  prescriptionReminders: boolean;
  subscriptionReminders: boolean;
  emergencyAlerts: boolean;
};

const defaultPrefs: Prefs = {
  emailEnabled: true,
  smsEnabled: true,
  pushEnabled: true,
  lineEnabled: true,
  appointmentReminders: true,
  prescriptionReminders: true,
  subscriptionReminders: true,
  emergencyAlerts: true,
};

export default function NotificationsPage() {
  const [items, setItems] = useState<Notification[]>([]);
  const [prefs, setPrefs] = useState<Prefs>(defaultPrefs);
  const [filter, setFilter] = useState("");
  const [message, setMessage] = useState("");
  const [role, setRole] = useState("");

  async function load() {
    const res = await fetch(`/api/notifications${filter ? `?channel=${filter}` : ""}`);
    if (res.ok) {
      const data = await res.json();
      setItems(data.notifications || []);
      if (data.preferences) setPrefs({ ...defaultPrefs, ...data.preferences });
    }
  }

  useEffect(() => {
    load();
    fetch("/api/auth")
      .then((r) => r.json())
      .then((d) => setRole(d.user?.role || ""));
  }, [filter]);

  async function markRead(id: string) {
    await fetch("/api/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "mark_read", id }),
    });
    load();
  }

  async function savePrefs(e: FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "save_preferences", ...prefs }),
    });
    const data = await res.json();
    setMessage(res.ok ? "Preferences saved" : data.error);
  }

  async function testChannel(channel: string) {
    const res = await fetch("/api/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "send_test", channel }),
    });
    const data = await res.json();
    setMessage(res.ok ? data.message : data.error);
    load();
  }

  async function registerPush() {
    const token = `web-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    await fetch("/api/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "register_push", token, platform: "web" }),
    });
    setMessage("Push device registered (demo token)");
  }

  return (
    <PageShell
      eyebrow="Notification Center"
      title="Inbox & channels"
      description="Email · SMS · Push · LINE · appointment / prescription / subscription reminders · emergency alerts."
    >
      {message && <p className="muted">{message}</p>}

      <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", marginBottom: "1rem" }}>
        {["", "email", "sms", "push", "line", "emergency", "inbox"].map((c) => (
          <button
            key={c || "all"}
            className={filter === c ? "btn btn-primary" : "btn btn-ghost"}
            type="button"
            onClick={() => setFilter(c)}
          >
            {c || "All"}
          </button>
        ))}
        <button
          className="btn"
          type="button"
          onClick={async () => {
            await fetch("/api/notifications", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action: "mark_all_read" }),
            });
            load();
          }}
        >
          Mark all read
        </button>
        <button className="btn" type="button" onClick={registerPush}>
          Register push device
        </button>
      </div>

      <form className="panel" onSubmit={savePrefs} style={{ marginBottom: "1.25rem" }}>
        <h2 style={{ marginTop: 0 }}>Channel preferences</h2>
        <div className="feature-grid">
          {(
            [
              ["emailEnabled", "Email"],
              ["smsEnabled", "SMS"],
              ["pushEnabled", "Push"],
              ["lineEnabled", "LINE"],
              ["appointmentReminders", "Appointment reminders"],
              ["prescriptionReminders", "Prescription reminders"],
              ["subscriptionReminders", "Subscription reminders"],
              ["emergencyAlerts", "Emergency alerts"],
            ] as const
          ).map(([key, label]) => (
            <label key={key} style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
              <input
                type="checkbox"
                checked={prefs[key]}
                onChange={(e) => setPrefs({ ...prefs, [key]: e.target.checked })}
              />
              {label}
            </label>
          ))}
        </div>
        <button className="btn btn-primary" type="submit" style={{ marginTop: "0.75rem" }}>
          Save preferences
        </button>
        <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap", marginTop: "0.75rem" }}>
          {["email", "sms", "push", "line"].map((c) => (
            <button key={c} className="btn btn-ghost" type="button" onClick={() => testChannel(c)}>
              Test {c}
            </button>
          ))}
        </div>
      </form>

      {(role === "ADMIN" || role === "DEVELOPER" || role === "HOSPITAL") && (
        <div className="panel" style={{ marginBottom: "1.25rem" }}>
          <h2 style={{ marginTop: 0 }}>Admin tools</h2>
          <button
            className="btn"
            type="button"
            onClick={async () => {
              const res = await fetch("/api/notifications", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  action: "emergency_broadcast",
                  subject: "Emergency health alert",
                  body: "This is a MedCare emergency broadcast test. Follow official guidance.",
                }),
              });
              const d = await res.json();
              setMessage(res.ok ? `Emergency sent to ${d.sent} patients` : d.error);
            }}
          >
            Send emergency alert
          </button>
          {(role === "ADMIN" || role === "DEVELOPER") && (
            <button
              className="btn"
              type="button"
              style={{ marginLeft: "0.5rem" }}
              onClick={async () => {
                const res = await fetch("/api/notifications", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ action: "run_reminders" }),
                });
                const d = await res.json();
                setMessage(res.ok ? `Reminders job sent ${d.sent}` : d.error);
                load();
              }}
            >
              Run reminder job
            </button>
          )}
        </div>
      )}

      {items.length === 0 && <p className="muted">No notifications yet.</p>}
      {items.map((n) => (
        <article key={n.id} className="panel" style={{ marginBottom: "0.85rem", opacity: n.read ? 0.7 : 1 }}>
          <p className="badge">{n.channel}</p>
          {n.kind && <span className="badge">{n.kind}</span>}
          <h3 style={{ margin: "0.35rem 0" }}>{n.subject}</h3>
          <p className="muted" style={{ whiteSpace: "pre-wrap" }}>{n.body}</p>
          {!n.read && (
            <button className="btn btn-ghost" type="button" onClick={() => markRead(n.id)}>
              Mark read
            </button>
          )}
        </article>
      ))}
    </PageShell>
  );
}
