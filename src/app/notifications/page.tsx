"use client";

import { useEffect, useState } from "react";
import { PageShell } from "@/components/page-shell";

type Notification = {
  id: string;
  email: string;
  subject: string;
  body: string;
  channel: string;
  read: boolean;
  createdAt: string;
};

export default function NotificationsPage() {
  const [items, setItems] = useState<Notification[]>([]);

  async function load() {
    const res = await fetch("/api/notifications");
    if (res.ok) setItems((await res.json()).notifications || []);
  }

  useEffect(() => {
    load();
  }, []);

  async function markRead(id: string) {
    await fetch("/api/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "mark_read", id }),
    });
    load();
  }

  return (
    <PageShell
      eyebrow="Notifications"
      title="Inbox"
      description="Subscription codes and system messages arrive here."
    >
      {items.length === 0 && <p className="muted">No notifications yet.</p>}
      {items.map((n) => (
        <article key={n.id} className="panel" style={{ marginBottom: "0.85rem", opacity: n.read ? 0.7 : 1 }}>
          <p className="badge">{n.channel}</p>
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
