"use client";

import { useEffect, useState } from "react";
import { PageShell } from "@/components/page-shell";

type Medicine = {
  id: string;
  name: string;
  priceYen: number;
  stock: number;
  imageUrl?: string | null;
  manufacturer?: string | null;
  pharmacy: { name: string; deliveryAvailable: boolean };
};

export default function MarketplacePage() {
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function load() {
    const res = await fetch("/api/marketplace");
    const data = await res.json();
    setMedicines(data.medicines || []);
  }

  useEffect(() => {
    load();
  }, []);

  async function order(id: string) {
    setMessage("");
    setError("");
    const res = await fetch("/api/marketplace", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ medicineId: id, quantity: 1 }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Order failed — sign in required");
      return;
    }
    setMessage(`Ordered ${data.order.quantity}× item — ¥${data.order.totalYen.toLocaleString()}`);
    load();
  }

  return (
    <PageShell
      eyebrow="Marketplace"
      title="Medication marketplace"
      description="Compare prices and order from verified pharmacies."
    >
      {message && <p className="muted">{message}</p>}
      {error && <p className="error-text">{error}</p>}

      <div className="feature-grid">
        {medicines.map((m) => (
          <div key={m.id} className="panel">
            {m.imageUrl && (
              <img src={m.imageUrl} alt="" style={{ width: "100%", borderRadius: 8, marginBottom: "0.5rem" }} />
            )}
            <h3 style={{ marginTop: 0 }}>{m.name}</h3>
            <p className="muted">{m.manufacturer} · {m.pharmacy.name}</p>
            <p>
              <strong>¥{m.priceYen.toLocaleString()}</strong> · Stock: {m.stock}
            </p>
            <button
              className="btn btn-primary"
              type="button"
              disabled={m.stock < 1}
              onClick={() => order(m.id)}
            >
              Order
            </button>
          </div>
        ))}
      </div>
      {medicines.length === 0 && <p className="muted">No medicines listed yet.</p>}
    </PageShell>
  );
}
