"use client";

import { FormEvent, useEffect, useState } from "react";
import { PageShell } from "@/components/page-shell";

type Medicine = {
  id: string;
  name: string;
  priceYen: number;
  stock: number;
  imageUrl?: string | null;
  manufacturer?: string | null;
  ingredients?: string | null;
  interactions?: string | null;
  warnings?: string | null;
  alternatives?: string | null;
  pharmacy: {
    id?: string;
    name: string;
    deliveryAvailable: boolean;
    pickupAvailable?: boolean;
    discounts?: string | null;
  };
};

type Detail = {
  medicine: Medicine;
  alternatives: Medicine[];
  reviews: Array<{ id: string; rating: number; comment: string | null; author: { name: string } }>;
  priceComparison: Medicine[];
};

export default function MarketplacePage() {
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Detail | null>(null);
  const [compareName, setCompareName] = useState("");
  const [comparison, setComparison] = useState<Medicine[]>([]);
  const [coupon, setCoupon] = useState("");
  const [delivery, setDelivery] = useState(true);
  const [qty, setQty] = useState(1);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function load(query = q) {
    const res = await fetch(`/api/marketplace?q=${encodeURIComponent(query)}`);
    const data = await res.json();
    setMedicines(data.medicines || []);
  }

  useEffect(() => {
    load();
  }, []);

  async function openProfile(id: string) {
    setError("");
    const res = await fetch(`/api/marketplace?id=${id}`);
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Failed to load profile");
      return;
    }
    setSelected(data);
    setCompareName(data.medicine.name);
  }

  async function runCompare() {
    const res = await fetch(
      `/api/marketplace?compare=1&name=${encodeURIComponent(compareName || q)}`
    );
    const data = await res.json();
    setComparison(data.comparison || []);
  }

  async function order(id: string) {
    setMessage("");
    setError("");
    const res = await fetch("/api/marketplace", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "order",
        medicineId: id,
        quantity: qty,
        delivery,
        couponCode: coupon || undefined,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Order failed — sign in required");
      return;
    }
    setMessage(
      `Ordered ${data.order.quantity}× — ¥${data.order.totalYen.toLocaleString()} (${data.order.delivery ? "delivery" : "pickup"}) from ${data.order.pharmacy}`
    );
    load();
    if (selected) openProfile(id);
  }

  async function submitReview(e: FormEvent) {
    e.preventDefault();
    if (!selected) return;
    const res = await fetch("/api/marketplace", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "review",
        medicineId: selected.medicine.id,
        rating: reviewRating,
        comment: reviewComment,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Review failed");
      return;
    }
    setMessage("Medicine review submitted");
    setReviewComment("");
    openProfile(selected.medicine.id);
  }

  return (
    <PageShell
      eyebrow="Marketplace"
      title="Medication marketplace"
      description="Medicine profiles, alternatives, price comparison, delivery, and reviews."
    >
      {message && <p className="muted">{message}</p>}
      {error && <p className="error-text">{error}</p>}

      <div className="panel" style={{ marginBottom: "1rem", display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        <input
          className="input"
          style={{ flex: 1, minWidth: 200 }}
          placeholder="Search medicines, ingredients, warnings…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <button className="btn btn-primary" type="button" onClick={() => load()}>
          Search
        </button>
        <button className="btn" type="button" onClick={runCompare}>
          Compare prices
        </button>
      </div>

      <div className="panel" style={{ marginBottom: "1rem" }}>
        <h3 style={{ marginTop: 0 }}>Order options</h3>
        <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", alignItems: "end" }}>
          <div>
            <label className="label">Quantity</label>
            <input className="input" type="number" min={1} value={qty} onChange={(e) => setQty(Number(e.target.value))} />
          </div>
          <div>
            <label className="label">Coupon</label>
            <input className="input" value={coupon} onChange={(e) => setCoupon(e.target.value)} placeholder="WELCOME10" />
          </div>
          <label style={{ display: "flex", gap: "0.4rem", alignItems: "center" }}>
            <input type="checkbox" checked={delivery} onChange={(e) => setDelivery(e.target.checked)} />
            Delivery
          </label>
        </div>
      </div>

      {comparison.length > 0 && (
        <div className="panel" style={{ marginBottom: "1rem" }}>
          <h2 style={{ marginTop: 0 }}>Price comparison</h2>
          <table className="table">
            <thead>
              <tr>
                <th>Medicine</th>
                <th>Pharmacy</th>
                <th>Price</th>
                <th>Stock</th>
                <th>Delivery</th>
              </tr>
            </thead>
            <tbody>
              {comparison.map((m) => (
                <tr key={m.id}>
                  <td>
                    <button className="btn btn-ghost" type="button" onClick={() => openProfile(m.id)}>
                      {m.name}
                    </button>
                  </td>
                  <td>{m.pharmacy.name}</td>
                  <td>¥{m.priceYen.toLocaleString()}</td>
                  <td>{m.stock}</td>
                  <td>{m.pharmacy.deliveryAvailable ? "Yes" : "Pickup"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selected && (
        <div className="panel" style={{ marginBottom: "1.25rem" }}>
          <h2 style={{ marginTop: 0 }}>{selected.medicine.name}</h2>
          <p className="muted">
            {selected.medicine.manufacturer} · {selected.medicine.pharmacy.name}
            {selected.medicine.pharmacy.discounts ? ` · ${selected.medicine.pharmacy.discounts}` : ""}
          </p>
          {selected.medicine.imageUrl && (
            <img
              src={selected.medicine.imageUrl}
              alt=""
              style={{ maxWidth: 280, borderRadius: 8, marginBottom: "0.75rem" }}
            />
          )}
          <div className="feature-grid">
            <div>
              <p className="badge">Ingredients</p>
              <p>{selected.medicine.ingredients || "—"}</p>
            </div>
            <div>
              <p className="badge">Interactions</p>
              <p>{selected.medicine.interactions || "—"}</p>
            </div>
            <div>
              <p className="badge">Warnings</p>
              <p>{selected.medicine.warnings || "—"}</p>
            </div>
            <div>
              <p className="badge">Availability</p>
              <p>
                Stock {selected.medicine.stock} ·{" "}
                {selected.medicine.pharmacy.deliveryAvailable ? "Delivery" : ""}{" "}
                {selected.medicine.pharmacy.pickupAvailable !== false ? "Pickup" : ""}
              </p>
            </div>
          </div>
          <p style={{ marginTop: "0.75rem" }}>
            <strong>¥{selected.medicine.priceYen.toLocaleString()}</strong>
          </p>
          <button
            className="btn btn-primary"
            type="button"
            disabled={selected.medicine.stock < 1}
            onClick={() => order(selected.medicine.id)}
          >
            Order {delivery ? "with delivery" : "for pickup"}
          </button>

          <h3>Alternatives</h3>
          {selected.alternatives.length === 0 && <p className="muted">No alternatives found.</p>}
          <ul>
            {selected.alternatives.map((a) => (
              <li key={a.id}>
                <button className="btn btn-ghost" type="button" onClick={() => openProfile(a.id)}>
                  {a.name}
                </button>{" "}
                — ¥{a.priceYen.toLocaleString()} @ {a.pharmacy.name}
              </li>
            ))}
          </ul>

          <h3>Price peers</h3>
          <ul>
            {selected.priceComparison.slice(0, 8).map((p) => (
              <li key={p.id}>
                {p.name} — ¥{p.priceYen.toLocaleString()} ({p.pharmacy.name})
              </li>
            ))}
          </ul>

          <h3>Reviews</h3>
          {selected.reviews.map((r) => (
            <div key={r.id} className="muted" style={{ marginBottom: "0.35rem" }}>
              {"★".repeat(r.rating)} {r.author.name}: {r.comment}
            </div>
          ))}
          <form onSubmit={submitReview} style={{ marginTop: "0.75rem" }}>
            <label className="label">Your review</label>
            <input
              className="input"
              type="number"
              min={1}
              max={5}
              value={reviewRating}
              onChange={(e) => setReviewRating(Number(e.target.value))}
            />
            <textarea
              className="input"
              rows={2}
              value={reviewComment}
              onChange={(e) => setReviewComment(e.target.value)}
              placeholder="How did this medicine work for you?"
            />
            <button className="btn" type="submit" style={{ marginTop: "0.5rem" }}>
              Submit review
            </button>
          </form>
        </div>
      )}

      <div className="feature-grid">
        {medicines.map((m) => (
          <div key={m.id} className="panel">
            {m.imageUrl && (
              <img src={m.imageUrl} alt="" style={{ width: "100%", borderRadius: 8, marginBottom: "0.5rem" }} />
            )}
            <h3 style={{ marginTop: 0 }}>{m.name}</h3>
            <p className="muted">{m.manufacturer} · {m.pharmacy.name}</p>
            <p className="muted" style={{ fontSize: "0.9rem" }}>
              {m.ingredients || "Ingredients n/a"}
            </p>
            <p>
              <strong>¥{m.priceYen.toLocaleString()}</strong> · Stock: {m.stock}
              {m.pharmacy.deliveryAvailable ? " · Delivery" : ""}
            </p>
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
              <button className="btn" type="button" onClick={() => openProfile(m.id)}>
                Profile
              </button>
              <button
                className="btn btn-primary"
                type="button"
                disabled={m.stock < 1}
                onClick={() => order(m.id)}
              >
                Order
              </button>
            </div>
          </div>
        ))}
      </div>
      {medicines.length === 0 && <p className="muted">No medicines listed yet.</p>}
    </PageShell>
  );
}
