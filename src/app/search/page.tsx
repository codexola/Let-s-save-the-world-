"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { PageShell } from "@/components/page-shell";

type SearchResult = {
  doctors: Array<{ id: string; specialty: string | null; user: { id: string; name: string; photoUrl?: string | null } }>;
  nurses: Array<{ id: string; clinicalSpecialties: string | null; user: { id: string; name: string; photoUrl?: string | null } }>;
  hospitals: Array<{ id: string; name: string; departments: string | null }>;
  medicines: Array<{ id: string; name: string; priceYen: number; stock: number }>;
  blogs: Array<{ id: string; title: string; author: { name: string } }>;
};

export default function SearchPage() {
  const [q, setQ] = useState("");
  const [type, setType] = useState("all");
  const [results, setResults] = useState<SearchResult | null>(null);
  const [loading, setLoading] = useState(false);

  async function search(e?: FormEvent) {
    e?.preventDefault();
    setLoading(true);
    const params = new URLSearchParams({ q, type });
    const res = await fetch(`/api/search?${params}`);
    const data = await res.json();
    setResults(data);
    setLoading(false);
  }

  useEffect(() => {
    search();
  }, []);

  return (
    <PageShell
      eyebrow="Search"
      title="Find care & content"
      description="Search doctors, hospitals, nurses, medicines, and medical blogs."
    >
      <form className="panel" onSubmit={search} style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
        <input
          className="input"
          placeholder="Search query…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          style={{ flex: 1, minWidth: 200 }}
        />
        <select className="input" value={type} onChange={(e) => setType(e.target.value)}>
          <option value="all">All</option>
          <option value="doctor">Doctors</option>
          <option value="nurse">Nurses</option>
          <option value="hospital">Hospitals</option>
          <option value="medicine">Medicines</option>
          <option value="blog">Blogs</option>
        </select>
        <button className="btn btn-primary" type="submit" disabled={loading}>
          {loading ? "Searching…" : "Search"}
        </button>
      </form>

      {results && (
        <div className="two-col-grid" style={{ marginTop: "1.25rem" }}>
          {(type === "all" || type === "doctor") && (
            <div className="panel">
              <h2 style={{ marginTop: 0 }}>Doctors</h2>
              {results.doctors?.length === 0 && <p className="muted">No doctors found.</p>}
              {results.doctors?.map((d) => (
                <div key={d.id} style={{ marginBottom: "0.5rem" }}>
                  <Link href={`/profile/${d.user.id}`} className="profile-link">
                    {d.user.photoUrl && <img src={d.user.photoUrl} alt="" className="avatar-sm" />}
                    {d.user.name} — {d.specialty}
                  </Link>
                </div>
              ))}
            </div>
          )}

          {(type === "all" || type === "nurse") && (
            <div className="panel">
              <h2 style={{ marginTop: 0 }}>Nurses</h2>
              {results.nurses?.length === 0 && <p className="muted">No nurses found.</p>}
              {results.nurses?.map((n) => (
                <div key={n.id} style={{ marginBottom: "0.5rem" }}>
                  <Link href={`/profile/${n.user.id}`} className="profile-link">
                    {n.user.name} — {n.clinicalSpecialties}
                  </Link>
                </div>
              ))}
            </div>
          )}

          {(type === "all" || type === "hospital") && (
            <div className="panel">
              <h2 style={{ marginTop: 0 }}>Hospitals</h2>
              {results.hospitals?.map((h) => (
                <div key={h.id} style={{ marginBottom: "0.5rem" }}>
                  <strong>{h.name}</strong>
                  <p className="muted" style={{ margin: 0 }}>{h.departments}</p>
                </div>
              ))}
            </div>
          )}

          {(type === "all" || type === "medicine") && (
            <div className="panel">
              <h2 style={{ marginTop: 0 }}>Medicines</h2>
              {results.medicines?.map((m) => (
                <div key={m.id} style={{ marginBottom: "0.5rem" }}>
                  {m.name} — ¥{m.priceYen.toLocaleString()} · stock {m.stock}
                </div>
              ))}
              <Link href="/marketplace" className="btn btn-ghost" style={{ marginTop: "0.5rem" }}>
                Browse marketplace
              </Link>
            </div>
          )}

          {(type === "all" || type === "blog") && (
            <div className="panel">
              <h2 style={{ marginTop: 0 }}>Blogs</h2>
              {results.blogs?.map((b) => (
                <div key={b.id} style={{ marginBottom: "0.5rem" }}>
                  <Link href={`/blog/${b.id}`}>{b.title}</Link>
                  <span className="muted"> — {b.author.name}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </PageShell>
  );
}
