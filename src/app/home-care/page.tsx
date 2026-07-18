"use client";

import { FormEvent, useEffect, useState } from "react";
import { PageShell } from "@/components/page-shell";

type Service = { type: string; label: string; priceYen: number };
type Order = {
  id: string;
  serviceType: string;
  title: string;
  status: string;
  scheduledAt: string | null;
  address: string | null;
  priceYen: number;
  equipmentItem: string | null;
  provider?: { name: string } | null;
};

export default function HomeCarePage() {
  const [services, setServices] = useState<Service[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [serviceType, setServiceType] = useState("doctor_home_visit");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function load() {
    const res = await fetch("/api/home-care");
    const d = await res.json();
    if (!res.ok) {
      setError(d.error || "Sign in required");
      return;
    }
    setServices(d.services || []);
    setOrders(d.orders || []);
    if (d.services?.[0]?.type) setServiceType(d.services[0].type);
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <PageShell
      eyebrow="Home care"
      title="Home healthcare platform"
      description="Doctor & nurse visits · PT/OT/speech therapy · home blood collection · medication delivery · equipment rental · elder care · rehabilitation."
    >
      {error && <p className="error-text">{error}</p>}
      {message && <p className="muted">{message}</p>}

      <div className="feature-grid" style={{ marginBottom: "1rem" }}>
        {services.map((s) => (
          <button
            key={s.type}
            type="button"
            className="panel"
            style={{ textAlign: "left", cursor: "pointer", border: serviceType === s.type ? "2px solid #0ea5e9" : undefined }}
            onClick={() => setServiceType(s.type)}
          >
            <strong>{s.label}</strong>
            <p className="muted">¥{s.priceYen.toLocaleString()}</p>
          </button>
        ))}
      </div>

      <form
        className="panel form-narrow"
        style={{ marginBottom: "1rem" }}
        onSubmit={async (e: FormEvent) => {
          e.preventDefault();
          const res = await fetch("/api/home-care", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "request",
              serviceType,
              address: "Setagaya, Tokyo",
              equipmentItem: serviceType === "medical_equipment_rental" ? "Oxygen concentrator" : undefined,
            }),
          });
          const d = await res.json();
          if (!res.ok) setError(d.error);
          else {
            setMessage(`Requested ${d.order.title}`);
            load();
          }
        }}
      >
        <h3 style={{ marginTop: 0 }}>Request service</h3>
        <p className="muted">Selected: {services.find((s) => s.type === serviceType)?.label}</p>
        <button className="btn btn-primary form-submit" type="submit">
          Request home care
        </button>
      </form>

      <h3>Your orders</h3>
      {orders.map((o) => (
        <div key={o.id} className="panel" style={{ marginBottom: "0.5rem" }}>
          <strong>
            {o.title} <span className="badge">{o.status}</span>
          </strong>
          <p className="muted">
            {o.scheduledAt ? new Date(o.scheduledAt).toLocaleString() : "TBD"} · {o.address} · ¥
            {o.priceYen.toLocaleString()}
            {o.provider ? ` · ${o.provider.name}` : ""}
            {o.equipmentItem ? ` · Equipment: ${o.equipmentItem}` : ""}
          </p>
          {o.status !== "completed" && (
            <button
              className="btn"
              type="button"
              onClick={async () => {
                await fetch("/api/home-care", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ action: "update_status", id: o.id, status: "completed" }),
                });
                load();
              }}
            >
              Mark completed
            </button>
          )}
        </div>
      ))}
    </PageShell>
  );
}
