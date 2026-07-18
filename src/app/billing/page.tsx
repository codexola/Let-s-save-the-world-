"use client";

import { FormEvent, useEffect, useState } from "react";
import { PageShell } from "@/components/page-shell";

type Invoice = {
  id: string;
  amountYen: number;
  description: string;
  status: string;
  createdAt: string;
  paidAt: string | null;
  providerRef: string | null;
  paymentMethod?: string | null;
  couponCode?: string | null;
  discountYen?: number;
  refundedYen?: number;
  corporate?: boolean;
};

type Coupon = {
  code: string;
  description: string | null;
  discountPercent: number;
  discountYen: number;
  ambassadorOnly: boolean;
};

export default function BillingPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<string[]>([]);
  const [paymentsMode, setPaymentsMode] = useState("mock");
  const [payMethod, setPayMethod] = useState("card");
  const [coupon, setCoupon] = useState("");
  const [ambassador, setAmbassador] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [supportMsg, setSupportMsg] = useState("");

  async function load() {
    const res = await fetch("/api/billing");
    if (!res.ok) {
      setError((await res.json()).error);
      return;
    }
    const data = await res.json();
    setInvoices(data.invoices || []);
    setCoupons(data.coupons || []);
    setPaymentMethods(data.paymentMethods || []);
    setPaymentsMode(data.paymentsMode || "mock");
  }

  useEffect(() => {
    load();
  }, []);

  async function pay(invoiceId: string) {
    setMessage("");
    setError("");
    const res = await fetch("/api/billing", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "pay",
        invoiceId,
        paymentMethod: payMethod,
        couponCode: coupon || undefined,
        ambassador,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error);
      return;
    }
    setMessage(`Paid via ${data.method}. Ref: ${data.providerRef}`);
    load();
  }

  async function refund(invoiceId: string) {
    const res = await fetch("/api/billing", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "refund", invoiceId }),
    });
    const data = await res.json();
    setMessage(res.ok ? "Refund processed" : data.error);
    load();
  }

  async function corporateBill(e: FormEvent) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget as HTMLFormElement);
    const res = await fetch("/api/billing", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "corporate_bill",
        employeeCount: Number(fd.get("employees")),
        perEmployeeYen: Number(fd.get("perEmployee")),
      }),
    });
    const data = await res.json();
    setMessage(res.ok ? `Corporate invoice ¥${data.invoice.amountYen.toLocaleString()} created` : data.error);
    load();
  }

  async function createInvoice(e: FormEvent) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget as HTMLFormElement);
    const res = await fetch("/api/billing", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "create_invoice",
        amountYen: Number(fd.get("amount")),
        description: fd.get("description"),
      }),
    });
    const data = await res.json();
    setMessage(res.ok ? "Invoice created" : data.error);
    load();
  }

  async function sendSupport(e: FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/billing", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "support",
        subject: "Billing support",
        message: supportMsg,
      }),
    });
    const data = await res.json();
    setMessage(res.ok ? data.message : data.error);
    setSupportMsg("");
  }

  const methodLabel: Record<string, string> = {
    card: "Credit card",
    apple_pay: "Apple Pay",
    google_pay: "Google Pay",
    bank_transfer: "Bank transfer",
    corporate: "Corporate billing",
  };

  return (
    <PageShell
      eyebrow="Billing"
      title="Invoices & payments"
      description={`Support · cards · Apple/Google Pay · bank transfer · coupons · refunds. Mode: ${paymentsMode}`}
    >
      {error && <p className="error-text">{error}</p>}
      {message && <p className="muted">{message}</p>}

      <div className="panel" style={{ marginBottom: "1rem" }}>
        <h2 style={{ marginTop: 0 }}>Pay with</h2>
        <select className="input" value={payMethod} onChange={(e) => setPayMethod(e.target.value)}>
          {(paymentMethods.length ? paymentMethods : Object.keys(methodLabel)).map((m) => (
            <option key={m} value={m}>
              {methodLabel[m] || m}
            </option>
          ))}
        </select>
        <label className="label">Coupon / discount code</label>
        <input className="input" value={coupon} onChange={(e) => setCoupon(e.target.value)} placeholder="WELCOME10" />
        <label style={{ display: "flex", gap: "0.4rem", alignItems: "center", marginTop: "0.5rem" }}>
          <input type="checkbox" checked={ambassador} onChange={(e) => setAmbassador(e.target.checked)} />
          Ambassador discount eligibility
        </label>
        {coupons.length > 0 && (
          <p className="muted" style={{ marginTop: "0.5rem" }}>
            Active: {coupons.map((c) => c.code).join(", ")}
          </p>
        )}
      </div>

      <div className="panel">
        <table className="table">
          <thead>
            <tr>
              <th>Description</th>
              <th>Amount</th>
              <th>Status</th>
              <th>Date</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {invoices.map((inv) => (
              <tr key={inv.id}>
                <td>
                  {inv.description}
                  {inv.corporate ? " · Corporate" : ""}
                  {inv.couponCode ? ` · ${inv.couponCode}` : ""}
                </td>
                <td>
                  ¥{inv.amountYen.toLocaleString()}
                  {inv.discountYen ? ` (−¥${inv.discountYen})` : ""}
                  {inv.refundedYen ? ` · refunded ¥${inv.refundedYen}` : ""}
                </td>
                <td>
                  <span className="badge">{inv.status}</span>
                </td>
                <td>{new Date(inv.createdAt).toLocaleDateString()}</td>
                <td style={{ display: "flex", gap: "0.35rem" }}>
                  {inv.status === "OPEN" && (
                    <button className="btn btn-primary" type="button" onClick={() => pay(inv.id)}>
                      Pay
                    </button>
                  )}
                  {inv.status === "PAID" && (
                    <button className="btn btn-ghost" type="button" onClick={() => refund(inv.id)}>
                      Refund
                    </button>
                  )}
                  {inv.providerRef && <span className="muted">{inv.providerRef}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {invoices.length === 0 && <p className="muted">No invoices.</p>}
      </div>

      <div className="feature-grid" style={{ marginTop: "1.25rem" }}>
        <form className="panel" onSubmit={createInvoice}>
          <h3 style={{ marginTop: 0 }}>Create invoice</h3>
          <label className="label">Amount (¥)</label>
          <input className="input" name="amount" type="number" min={0} required />
          <label className="label">Description</label>
          <input className="input" name="description" required />
          <button className="btn btn-primary" type="submit" style={{ marginTop: "0.5rem" }}>
            Create
          </button>
        </form>

        <form className="panel" onSubmit={corporateBill}>
          <h3 style={{ marginTop: 0 }}>Corporate billing</h3>
          <label className="label">Employees</label>
          <input className="input" name="employees" type="number" defaultValue={10} min={1} />
          <label className="label">¥ / employee</label>
          <input className="input" name="perEmployee" type="number" defaultValue={400} min={1} />
          <button className="btn btn-primary" type="submit" style={{ marginTop: "0.5rem" }}>
            Generate corporate invoice
          </button>
        </form>

        <form className="panel" onSubmit={sendSupport}>
          <h3 style={{ marginTop: 0 }}>Payment support</h3>
          <textarea
            className="input"
            rows={3}
            value={supportMsg}
            onChange={(e) => setSupportMsg(e.target.value)}
            placeholder="Describe your billing issue…"
            required
          />
          <button className="btn" type="submit" style={{ marginTop: "0.5rem" }}>
            Contact support
          </button>
        </form>
      </div>
    </PageShell>
  );
}
