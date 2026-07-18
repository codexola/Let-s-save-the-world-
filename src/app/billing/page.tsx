"use client";

import { useEffect, useState } from "react";
import { PageShell } from "@/components/page-shell";

type Invoice = {
  id: string;
  amountYen: number;
  description: string;
  status: string;
  createdAt: string;
  paidAt: string | null;
  providerRef: string | null;
};

export default function BillingPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [paymentsMode, setPaymentsMode] = useState("mock");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function load() {
    const res = await fetch("/api/billing");
    if (!res.ok) {
      setError((await res.json()).error);
      return;
    }
    const data = await res.json();
    setInvoices(data.invoices || []);
    setPaymentsMode(data.paymentsMode || "mock");
  }

  useEffect(() => {
    load();
  }, []);

  async function pay(invoiceId: string) {
    setMessage("");
    const res = await fetch("/api/billing", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "pay", invoiceId }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error);
      return;
    }
    setMessage(`Paid via ${paymentsMode}. Ref: ${data.providerRef}`);
    load();
  }

  return (
    <PageShell
      eyebrow="Billing"
      title="Invoices & payments"
      description={`Payment mode: ${paymentsMode}`}
    >
      {error && <p className="error-text">{error}</p>}
      {message && <p className="muted">{message}</p>}

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
                <td>{inv.description}</td>
                <td>¥{inv.amountYen.toLocaleString()}</td>
                <td><span className="badge">{inv.status}</span></td>
                <td>{new Date(inv.createdAt).toLocaleDateString()}</td>
                <td>
                  {inv.status === "OPEN" && (
                    <button className="btn btn-primary" type="button" onClick={() => pay(inv.id)}>
                      Pay
                    </button>
                  )}
                  {inv.providerRef && <span className="muted"> {inv.providerRef}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {invoices.length === 0 && <p className="muted">No invoices.</p>}
      </div>
    </PageShell>
  );
}
