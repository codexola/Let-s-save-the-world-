"use client";

import { FormEvent, useEffect, useState } from "react";
import { PageShell } from "@/components/page-shell";
import { SUBSCRIPTION_PLANS } from "@/lib/permissions";

export default function SubscriptionsPage() {
  const [message, setMessage] = useState("");
  const [code, setCode] = useState("");
  const [subs, setSubs] = useState<Array<{ id: string; plan: string; status: string; priceYen: number }>>([]);

  async function load() {
    const res = await fetch("/api/subscriptions");
    if (res.ok) setSubs((await res.json()).subscriptions || []);
  }

  useEffect(() => {
    load();
  }, []);

  async function purchase(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const res = await fetch("/api/subscriptions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "purchase",
        email: fd.get("email"),
        name: fd.get("name"),
        plan: fd.get("plan"),
        paymentMethod: fd.get("method"),
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setMessage(data.error);
      return;
    }
    setCode(data.code);
    setMessage("Registration code sent to email inbox.");
    load();
  }

  return (
    <PageShell
      eyebrow="Billing"
      title="Subscriptions"
      description="Purchase sends a registration code to your Notification inbox."
    >
      <div className="feature-grid">
        {Object.values(SUBSCRIPTION_PLANS).map((p) => (
          <div key={p.plan} className="panel">
            <h3 style={{ marginTop: 0 }}>{p.label}</h3>
            <p className="font-display" style={{ fontSize: "1.8rem", margin: "0.25rem 0" }}>
              ¥{p.priceYen.toLocaleString()}
            </p>
          </div>
        ))}
      </div>

      <form className="panel form-narrow" style={{ marginTop: "1.25rem" }} onSubmit={purchase}>
        <h2 style={{ marginTop: 0 }}>Purchase</h2>
        <label className="label">Email</label>
        <input className="input" name="email" type="email" required />
        <label className="label">Name</label>
        <input className="input" name="name" />
        <label className="label">Plan</label>
        <select className="input" name="plan" defaultValue="INDIVIDUAL">
          {Object.values(SUBSCRIPTION_PLANS).map((p) => (
            <option key={p.plan} value={p.plan}>
              {p.label}
            </option>
          ))}
        </select>
        <label className="label">Payment</label>
        <select className="input" name="method" defaultValue="card">
          <option value="card">Card</option>
        </select>
        <button className="btn btn-primary form-submit" type="submit">
          Pay & send code
        </button>
        {message && <p className="muted">{message}</p>}
        {code && <p>Code: <strong>{code}</strong></p>}
      </form>

      {subs.length > 0 && (
        <div className="panel" style={{ marginTop: "1.25rem" }}>
          <h2 style={{ marginTop: 0 }}>Your subscriptions</h2>
          <table className="table">
            <thead>
              <tr>
                <th>Plan</th>
                <th>Status</th>
                <th>Price</th>
              </tr>
            </thead>
            <tbody>
              {subs.map((s) => (
                <tr key={s.id}>
                  <td>{s.plan}</td>
                  <td>{s.status}</td>
                  <td>¥{s.priceYen.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </PageShell>
  );
}
