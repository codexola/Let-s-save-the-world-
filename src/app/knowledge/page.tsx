"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PageShell } from "@/components/page-shell";

type Item = {
  id: string;
  type: string;
  title: string;
  summary: string | null;
  body: string;
  mediaUrl: string | null;
  tags: string | null;
  category: string | null;
  viewCount: number;
};

type Drug = {
  id: string;
  name: string;
  manufacturer: string | null;
  ingredients: string | null;
  uses: string | null;
  dosage: string | null;
  interactions: string | null;
  warnings: string | null;
  sideEffects: string | null;
};

const TABS = [
  { key: "", label: "All" },
  { key: "article", label: "Medical articles" },
  { key: "video", label: "Videos" },
  { key: "research", label: "Research" },
  { key: "faq", label: "FAQs" },
  { key: "preventive", label: "Preventive care" },
  { key: "education", label: "Health education" },
  { key: "drug", label: "Drug database" },
];

export default function KnowledgeCenterPage({
  defaultTab = "",
}: {
  defaultTab?: string;
}) {
  const [tab, setTab] = useState(defaultTab);
  const [q, setQ] = useState("");
  const [items, setItems] = useState<Item[]>([]);
  const [drugs, setDrugs] = useState<Drug[]>([]);
  const [selected, setSelected] = useState<Item | Drug | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});

  async function load(type = tab, query = q) {
    if (type === "drug") {
      const res = await fetch(`/api/knowledge?type=drug&q=${encodeURIComponent(query)}`);
      const data = await res.json();
      setDrugs(data.drugs || []);
      setItems([]);
      return;
    }
    const params = new URLSearchParams();
    if (type) params.set("type", type);
    if (query) params.set("q", query);
    const res = await fetch(`/api/knowledge?${params}`);
    const data = await res.json();
    setItems(data.items || []);
    setCounts(data.counts || {});
    setDrugs([]);
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <PageShell
      eyebrow="Knowledge Center"
      title="Medical knowledge library"
      description="Articles, videos, research, drug database, FAQs, preventive care, and health education."
    >
      <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", marginBottom: "1rem" }}>
        {TABS.map((t) => (
          <button
            key={t.key || "all"}
            className={tab === t.key ? "btn btn-primary" : "btn btn-ghost"}
            type="button"
            onClick={() => {
              setTab(t.key);
              setSelected(null);
              load(t.key, q);
            }}
          >
            {t.label}
            {t.key && counts[t.key] != null ? ` (${counts[t.key]})` : ""}
          </button>
        ))}
      </div>

      <div className="panel" style={{ marginBottom: "1rem", display: "flex", gap: "0.5rem" }}>
        <input
          className="input"
          style={{ flex: 1 }}
          placeholder="Search knowledge…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <button className="btn btn-primary" type="button" onClick={() => load(tab, q)}>
          Search
        </button>
        <Link href="/blog" className="btn">
          Blog
        </Link>
      </div>

      {selected && "title" in selected && (
        <article className="panel" style={{ marginBottom: "1.25rem" }}>
          <p className="badge">{(selected as Item).type}</p>
          <h2 style={{ marginTop: 0 }}>{(selected as Item).title}</h2>
          {(selected as Item).mediaUrl && (
            (selected as Item).type === "video" ? (
              <video src={(selected as Item).mediaUrl!} controls style={{ width: "100%", maxHeight: 360, borderRadius: 8 }} />
            ) : (
              <img src={(selected as Item).mediaUrl!} alt="" style={{ width: "100%", maxHeight: 280, objectFit: "cover", borderRadius: 8 }} />
            )
          )}
          <p style={{ whiteSpace: "pre-wrap", lineHeight: 1.7 }}>{(selected as Item).body}</p>
          <button className="btn btn-ghost" type="button" onClick={() => setSelected(null)}>
            Close
          </button>
        </article>
      )}

      {selected && "name" in selected && (
        <article className="panel" style={{ marginBottom: "1.25rem" }}>
          <h2 style={{ marginTop: 0 }}>{(selected as Drug).name}</h2>
          <div className="feature-grid">
            <div><p className="badge">Manufacturer</p><p>{(selected as Drug).manufacturer || "—"}</p></div>
            <div><p className="badge">Ingredients</p><p>{(selected as Drug).ingredients || "—"}</p></div>
            <div><p className="badge">Uses</p><p>{(selected as Drug).uses || "—"}</p></div>
            <div><p className="badge">Dosage</p><p>{(selected as Drug).dosage || "—"}</p></div>
            <div><p className="badge">Interactions</p><p>{(selected as Drug).interactions || "—"}</p></div>
            <div><p className="badge">Warnings</p><p>{(selected as Drug).warnings || "—"}</p></div>
          </div>
          <button className="btn btn-ghost" type="button" onClick={() => setSelected(null)} style={{ marginTop: "0.75rem" }}>
            Close
          </button>
        </article>
      )}

      {tab === "drug" ? (
        <div className="feature-grid">
          {drugs.map((d) => (
            <button
              key={d.id}
              className="panel"
              type="button"
              style={{ textAlign: "left", cursor: "pointer" }}
              onClick={() => setSelected(d)}
            >
              <h3 style={{ marginTop: 0 }}>{d.name}</h3>
              <p className="muted">{d.manufacturer}</p>
              <p className="muted" style={{ fontSize: "0.9rem" }}>{d.uses}</p>
            </button>
          ))}
          {drugs.length === 0 && <p className="muted">No drug monographs found.</p>}
        </div>
      ) : (
        <div className="feature-grid">
          {items.map((item) => (
            <button
              key={item.id}
              className="panel"
              type="button"
              style={{ textAlign: "left", cursor: "pointer" }}
              onClick={() => setSelected(item)}
            >
              <span className="badge">{item.type}</span>
              <h3 style={{ marginTop: "0.35rem" }}>{item.title}</h3>
              <p className="muted">{item.summary || item.body.slice(0, 120)}…</p>
              <p className="muted" style={{ fontSize: "0.8rem" }}>{item.viewCount} views</p>
            </button>
          ))}
          {items.length === 0 && <p className="muted">No content in this category yet.</p>}
        </div>
      )}
    </PageShell>
  );
}
