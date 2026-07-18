"use client";

import { FormEvent, useEffect, useState } from "react";
import { PageShell } from "@/components/page-shell";
import { SUBSCRIPTION_PLANS } from "@/lib/permissions";

type Sub = {
  id: string;
  plan: string;
  status: string;
  priceYen: number;
  endsAt?: string | null;
  startsAt?: string | null;
};

export default function SubscriptionsPage() {
  const [message, setMessage] = useState("");
  const [code, setCode] = useState("");
  const [subs, setSubs] = useState<Sub[]>([]);
  const [invoices, setInvoices] = useState<Array<{ id: string; amountYen: number; description: string; status: string }>>([]);
  const [plan, setPlan] = useState("INDIVIDUAL");
  const [employees, setEmployees] = useState(10);
  const [trial, setTrial] = useState(false);
  const [coupon, setCoupon] = useState("");

  const selected = Object.values(SUBSCRIPTION_PLANS).find((p) => p.plan === plan);
  const previewYen = selected
    ? selected.perEmployee
      ? selected.priceYen * Math.max(1, employees)
      : selected.priceYen
    : 0;

  async function load() {
    const res = await fetch("/api/subscriptions");
    if (res.ok) {
      const data = await res.json();
      setSubs(data.subscriptions || []);
      setInvoices(data.invoices || []);
    }
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
        employeeCount: employees,
        trial,
        couponCode: coupon || undefined,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setMessage(data.error);
      return;
    }
    setCode(data.code);
    setMessage(data.message + (data.priceYen != null ? ` Charge: ¥${data.priceYen.toLocaleString()}` : ""));
    load();
  }

  async function renew(id: string) {
    const res = await fetch("/api/subscriptions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "renew", subscriptionId: id }),
    });
    const data = await res.json();
    setMessage(res.ok ? "Renewed for 30 days" : data.error);
    load();
  }

  async function cancel(id: string) {
    const res = await fetch("/api/subscriptions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "cancel", subscriptionId: id }),
    });
    const data = await res.json();
    setMessage(res.ok ? "Subscription cancelled" : data.error);
    load();
  }

  return (
    <PageShell
      eyebrow="Billing"
      title="Subscriptions"
      description="Individual ¥1,000 · Premium features ¥500 · Corporate ¥400/employee · Premium ¥200/employee — trial, renew, cancel, invoices."
    >
      <div className="feature-grid">
        {Object.values(SUBSCRIPTION_PLANS).map((p) => (
          <div key={p.plan} className="panel">
            <h3 style={{ marginTop: 0 }}>{p.label}</h3>
            <p className="font-display" style={{ fontSize: "1.8rem", margin: "0.25rem 0" }}>
              ¥{p.priceYen.toLocaleString()}
              {p.perEmployee ? <span style={{ fontSize: "0.9rem" }}>/employee</span> : <span style={{ fontSize: "0.9rem" }}>/mo</span>}
            </p>
          </div>
        ))}
      </div>

      <form className="panel form-narrow" style={{ marginTop: "1.25rem" }} onSubmit={purchase}>
        <h2 style={{ marginTop: 0 }}>Purchase or start free trial</h2>
        <label className="label">Email</label>
        <input className="input" name="email" type="email" required />
        <label className="label">Name</label>
        <input className="input" name="name" />
        <label className="label">Plan</label>
        <select className="input" name="plan" value={plan} onChange={(e) => setPlan(e.target.value)}>
          {Object.values(SUBSCRIPTION_PLANS).map((p) => (
            <option key={p.plan} value={p.plan}>
              {p.label}
            </option>
          ))}
        </select>
        {selected?.perEmployee && (
          <>
            <label className="label">Employees</label>
            <input
              className="input"
              type="number"
              min={1}
              value={employees}
              onChange={(e) => setEmployees(Number(e.target.value))}
            />
          </>
        )}
        <label className="label">Payment</label>
        <select className="input" name="method" defaultValue="card">
          <option value="card">Credit card</option>
          <option value="apple_pay">Apple Pay</option>
          <option value="google_pay">Google Pay</option>
          <option value="bank_transfer">Bank transfer</option>
          <option value="corporate">Corporate billing</option>
        </select>
        <label className="label">Coupon / ambassador code</label>
        <input className="input" value={coupon} onChange={(e) => setCoupon(e.target.value)} placeholder="Optional" />
        <label style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginTop: "0.75rem" }}>
          <input type="checkbox" checked={trial} onChange={(e) => setTrial(e.target.checked)} />
          14-day free trial
        </label>
        <p className="muted">
          Estimated: {trial ? "¥0 (trial)" : `¥${previewYen.toLocaleString()}`}
        </p>
        <button className="btn btn-primary form-submit" type="submit">
          {trial ? "Start trial" : "Pay & send code"}
        </button>
        {message && <p className="muted">{message}</p>}
        {code && (
          <p>
            Code: <strong>{code}</strong>
          </p>
        )}
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
                <th>Ends</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {subs.map((s) => (
                <tr key={s.id}>
                  <td>{s.plan}</td>
                  <td>{s.status}</td>
                  <td>¥{s.priceYen.toLocaleString()}</td>
                  <td>{s.endsAt ? new Date(s.endsAt).toLocaleDateString() : "—"}</td>
                  <td style={{ display: "flex", gap: "0.35rem" }}>
                    {s.status !== "CANCELLED" && (
                      <>
                        <button className="btn btn-ghost" type="button" onClick={() => renew(s.id)}>
                          Renew
                        </button>
                        <button className="btn btn-ghost" type="button" onClick={() => cancel(s.id)}>
                          Cancel
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {invoices.length > 0 && (
        <div className="panel" style={{ marginTop: "1.25rem" }}>
          <h2 style={{ marginTop: 0 }}>Subscription invoices</h2>
          <ul>
            {invoices.map((inv) => (
              <li key={inv.id}>
                {inv.description} — ¥{inv.amountYen.toLocaleString()} ({inv.status})
              </li>
            ))}
          </ul>
        </div>
      )}
    </PageShell>
  );
}
