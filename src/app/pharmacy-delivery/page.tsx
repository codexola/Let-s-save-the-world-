"use client";

import { FormEvent, useEffect, useState } from "react";
import { PageShell } from "@/components/page-shell";

type Delivery = {
  id: string;
  medicineName: string;
  status: string;
  sameDay: boolean;
  homeDelivery: boolean;
  trackingCode: string;
  etaMinutes: number | null;
  courierLat: number | null;
  courierLng: number | null;
  coldChain: boolean;
  coldTempC: number | null;
  coldAlert: boolean;
  prescriptionImage: string | null;
  address: string | null;
};

export default function PharmacyDeliveryPage() {
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [refills, setRefills] = useState<Array<{ id: string; medication: string; nextRefillAt: string }>>([]);
  const [medicines, setMedicines] = useState<Array<{ name: string; stock: number }>>([]);
  const [medicineName, setMedicineName] = useState("Amlodipine 5mg");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function load() {
    const res = await fetch("/api/pharmacy-delivery");
    const d = await res.json();
    if (!res.ok) {
      setError(d.error || "Sign in required");
      return;
    }
    setDeliveries(d.deliveries || []);
    setRefills(d.refills || []);
    setMedicines(d.medicines || []);
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <PageShell
      eyebrow="Pharmacy network"
      title="Pharmacy delivery network"
      description="Medicine delivery · same-day · prescription upload · real-time tracking · cold-chain · home delivery · automatic refills · inventory sync."
    >
      {error && <p className="error-text">{error}</p>}
      {message && <p className="muted">{message}</p>}

      <form
        className="panel form-narrow"
        style={{ marginBottom: "1rem" }}
        onSubmit={async (e: FormEvent) => {
          e.preventDefault();
          const res = await fetch("/api/pharmacy-delivery", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "same_day",
              medicineName,
              sameDay: true,
              coldChain: /insulin/i.test(medicineName),
              address: "Setagaya, Tokyo",
            }),
          });
          const d = await res.json();
          if (!res.ok) setError(d.error);
          else {
            setMessage(`Same-day delivery ${d.delivery.trackingCode}`);
            load();
          }
        }}
      >
        <h3 style={{ marginTop: 0 }}>Medicine / same-day home delivery</h3>
        <input className="input" value={medicineName} onChange={(e) => setMedicineName(e.target.value)} />
        <button className="btn btn-primary form-submit" type="submit">
          Request same-day delivery
        </button>
      </form>

      <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", marginBottom: "1rem" }}>
        <button
          className="btn"
          type="button"
          onClick={async () => {
            const res = await fetch("/api/pharmacy-delivery", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                action: "upload_rx",
                medicineName: "From Rx upload",
                prescriptionImage: "demo-rx-image",
                coldChain: true,
              }),
            });
            const d = await res.json();
            setMessage(d.message || d.error);
            load();
          }}
        >
          Prescription upload
        </button>
        <button
          className="btn"
          type="button"
          onClick={async () => {
            await fetch("/api/pharmacy-delivery", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action: "auto_refill", medication: medicineName, intervalDays: 30 }),
            });
            setMessage("Automatic refill scheduled");
            load();
          }}
        >
          Enable automatic refill
        </button>
        <button
          className="btn"
          type="button"
          onClick={async () => {
            const res = await fetch("/api/pharmacy-delivery", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action: "sync_inventory" }),
            });
            const d = await res.json();
            setMessage(`Inventory sync: restocked ${d.restocked}/${d.medicines}`);
            load();
          }}
        >
          Inventory synchronization
        </button>
        <button
          className="btn"
          type="button"
          onClick={async () => {
            const res = await fetch("/api/pharmacy-delivery", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action: "process_refills" }),
            });
            const d = await res.json();
            setMessage(`Processed ${d.created?.length || 0} due refills`);
            load();
          }}
        >
          Process due refills
        </button>
      </div>

      <h3>Real-time tracking</h3>
      {deliveries.map((d) => (
        <div key={d.id} className="panel" style={{ marginBottom: "0.5rem" }}>
          <strong>
            {d.medicineName} <span className="badge">{d.status}</span> {d.sameDay ? "same-day" : ""}{" "}
            {d.homeDelivery ? "home" : ""}
          </strong>
          <p className="muted">
            Track {d.trackingCode} · ETA {d.etaMinutes}m · GPS {d.courierLat?.toFixed(4)}, {d.courierLng?.toFixed(4)}
            {d.coldChain ? ` · cold-chain ${d.coldTempC}°C${d.coldAlert ? " ALERT" : " OK"}` : ""}
            {d.prescriptionImage ? " · Rx uploaded" : ""}
          </p>
          <button
            className="btn"
            type="button"
            onClick={async () => {
              await fetch("/api/pharmacy-delivery", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "track", id: d.id }),
              });
              load();
            }}
          >
            Refresh tracking
          </button>
          {d.status !== "delivered" && (
            <button
              className="btn"
              type="button"
              onClick={async () => {
                await fetch("/api/pharmacy-delivery", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ action: "delivered", id: d.id }),
                });
                load();
              }}
            >
              Mark delivered
            </button>
          )}
        </div>
      ))}

      <h3>Automatic refills</h3>
      {refills.map((r) => (
        <p key={r.id}>
          {r.medication} — next {new Date(r.nextRefillAt).toLocaleDateString()}
        </p>
      ))}

      <h3>Inventory (synced)</h3>
      <p className="muted">{medicines.map((m) => `${m.name}:${m.stock}`).join(" · ") || "No medicines"}</p>
    </PageShell>
  );
}
