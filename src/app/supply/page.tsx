"use client";

import { useEffect, useState } from "react";
import { PageShell } from "@/components/page-shell";

type Product = {
  id: string;
  name: string;
  category: string;
  priceYen: number;
  stock: number;
  ratingAvg: number;
  sku: string | null;
  supplier?: { id: string; name: string; ratingAvg: number } | null;
};

type Supplier = { id: string; name: string; ratingAvg: number; reviewCount: number; verified: boolean };

export default function SupplyPage() {
  const [categories, setCategories] = useState<string[]>([]);
  const [category, setCategory] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [orders, setOrders] = useState<Array<{ id: string; totalYen: number; status: string; items: Array<{ quantity: number; product: { name: string } }> }>>([]);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function load() {
    const params = new URLSearchParams();
    if (category) params.set("category", category);
    const res = await fetch(`/api/supply?${params}`);
    const d = await res.json();
    if (!res.ok) {
      setError(d.error || "Sign in required");
      return;
    }
    setCategories(d.categories || []);
    setProducts(d.products || []);
    setSuppliers(d.suppliers || []);
    setOrders(d.orders || []);
  }

  useEffect(() => {
    load();
  }, [category]);

  return (
    <PageShell
      eyebrow="Procurement"
      title="Medical supply marketplace"
      description="Hospitals purchase medical equipment, medicine, consumables, laboratory & surgical supplies, PPE — inventory management and supplier ratings."
    >
      {error && <p className="error-text">{error}</p>}
      {message && <p className="muted">{message}</p>}

      <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap", marginBottom: "1rem" }}>
        <button className={!category ? "btn btn-primary" : "btn btn-ghost"} type="button" onClick={() => setCategory("")}>
          All
        </button>
        {categories.map((c) => (
          <button
            key={c}
            className={category === c ? "btn btn-primary" : "btn btn-ghost"}
            type="button"
            onClick={() => setCategory(c)}
          >
            {c.replace(/_/g, " ")}
          </button>
        ))}
      </div>

      <div className="feature-grid" style={{ marginBottom: "1rem" }}>
        {products.map((p) => (
          <div key={p.id} className="panel">
            <p className="badge">{p.category.replace(/_/g, " ")}</p>
            <strong>{p.name}</strong>
            <p className="muted">
              SKU {p.sku} · stock {p.stock} · ★ {p.ratingAvg.toFixed(1)}
            </p>
            <p>¥{p.priceYen.toLocaleString()}</p>
            <p className="muted">{p.supplier?.name}</p>
            <button
              className="btn"
              type="button"
              onClick={() => setCart({ ...cart, [p.id]: (cart[p.id] || 0) + 1 })}
            >
              Add to order ({cart[p.id] || 0})
            </button>
          </div>
        ))}
      </div>

      <button
        className="btn btn-primary"
        type="button"
        style={{ marginBottom: "1rem" }}
        onClick={async () => {
          const items = Object.entries(cart).map(([productId, quantity]) => ({ productId, quantity }));
          if (!items.length) {
            setError("Cart empty");
            return;
          }
          const res = await fetch("/api/supply", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "order", items }),
          });
          const d = await res.json();
          if (!res.ok) setError(d.error);
          else {
            setMessage(`Order placed ¥${d.order.totalYen.toLocaleString()}`);
            setCart({});
            load();
          }
        }}
      >
        Place hospital purchase order
      </button>

      <h3>Supplier ratings</h3>
      <div className="feature-grid" style={{ marginBottom: "1rem" }}>
        {suppliers.map((s) => (
          <div key={s.id} className="panel">
            <strong>{s.name}</strong>
            <p className="badge">
              ★ {s.ratingAvg.toFixed(2)} · {s.reviewCount} reviews {s.verified ? "· verified" : ""}
            </p>
            <button
              className="btn"
              type="button"
              onClick={async () => {
                await fetch("/api/supply", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ action: "rate_supplier", supplierId: s.id, rating: 5 }),
                });
                load();
              }}
            >
              Rate 5★
            </button>
          </div>
        ))}
      </div>

      <h3>Inventory / orders</h3>
      {orders.map((o) => (
        <div key={o.id} className="panel" style={{ marginBottom: "0.5rem" }}>
          <span className="badge">{o.status}</span> ¥{o.totalYen.toLocaleString()} —{" "}
          {o.items.map((i) => `${i.product.name}×${i.quantity}`).join(", ")}
        </div>
      ))}
    </PageShell>
  );
}
