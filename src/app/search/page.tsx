"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { PageShell } from "@/components/page-shell";

type Doctor = {
  id: string;
  userId: string;
  name: string;
  photoUrl?: string | null;
  specialty?: string | null;
  consultationFee?: number | null;
  yearsExperience?: number | null;
  languages?: string | null;
  gender?: string | null;
  onlineAvailable?: boolean;
  avgRating?: number | null;
  distanceKm?: number | null;
  score?: number;
  matchedOn?: string[];
  treatmentMethods?: string | null;
};

type Nurse = {
  id: string;
  userId: string;
  name: string;
  clinicalSpecialties?: string | null;
  specialty?: string | null;
  homeVisitAvailable?: boolean;
  onlineAvailable?: boolean;
  consultationFee?: number | null;
  yearsExperience?: number | null;
  languages?: string | null;
  gender?: string | null;
  avgRating?: number | null;
  score?: number;
};

type Hospital = {
  id: string;
  userId: string;
  name: string;
  departments?: string | null;
  address?: string | null;
  acceptedInsurance?: string | null;
  languages?: string | null;
  emergencyAvailable?: boolean;
  distanceKm?: number | null;
  avgRating?: number | null;
  score?: number;
  treatmentMethods?: string | null;
};

type Medicine = {
  id: string;
  name: string;
  priceYen: number;
  stock: number;
  manufacturer?: string | null;
  ingredients?: string | null;
  pharmacyName?: string | null;
  score?: number;
};

type Disease = { name: string; specialties: string[]; synonyms: string[] };

type BlogHit = {
  id: string;
  title: string;
  category?: string | null;
  tags?: string | null;
  authorName?: string | null;
  authorRole?: string | null;
  likeCount?: number;
  viewCount?: number;
};

type SearchResult = {
  doctors: Doctor[];
  nurses: Nurse[];
  hospitals: Hospital[];
  medicines: Medicine[];
  blogs?: BlogHit[];
  diseases?: Disease[];
  meta?: { resultCounts?: Record<string, number> };
};

const emptyFilters = {
  q: "",
  type: "all",
  disease: "",
  symptoms: "",
  medication: "",
  insurance: "",
  location: "",
  maxDistanceKm: "",
  minPrice: "",
  maxPrice: "",
  minRating: "",
  minExperience: "",
  language: "",
  availability: "",
  gender: "",
  department: "",
  treatment: "",
  onlineConsultation: false,
  homeVisit: false,
  emergencySupport: false,
  sort: "relevance",
};

export default function SearchPage() {
  const [filters, setFilters] = useState(emptyFilters);
  const [coords, setCoords] = useState<{ lat?: number; lng?: number }>({});
  const [results, setResults] = useState<SearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(true);

  function set<K extends keyof typeof emptyFilters>(key: K, value: (typeof emptyFilters)[K]) {
    setFilters((f) => ({ ...f, [key]: value }));
  }

  async function search(e?: FormEvent) {
    e?.preventDefault();
    setLoading(true);
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => {
      if (typeof v === "boolean") {
        if (v) params.set(k, "1");
      } else if (v !== "" && v != null) {
        params.set(k, String(v));
      }
    });
    if (coords.lat != null) params.set("latitude", String(coords.lat));
    if (coords.lng != null) params.set("longitude", String(coords.lng));
    const res = await fetch(`/api/search?${params}`);
    const data = await res.json();
    setResults(data);
    setLoading(false);
  }

  useEffect(() => {
    if (typeof navigator !== "undefined" && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => setCoords({ lat: 35.6812, lng: 139.7671 })
      );
    } else {
      setCoords({ lat: 35.6812, lng: 139.7671 });
    }
    search();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <PageShell
      eyebrow="Search Engine"
      title="Find care by every filter"
      description="Search by disease, symptoms, medication, providers, insurance, location, distance, price, rating, experience, language, availability, gender, department, treatments, online, home visit, and emergency support."
    >
      <form className="panel" onSubmit={search}>
        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
          <input
            className="input"
            placeholder="General query…"
            value={filters.q}
            onChange={(e) => set("q", e.target.value)}
            style={{ flex: 1, minWidth: 180 }}
          />
          <select className="input" value={filters.type} onChange={(e) => set("type", e.target.value)}>
            <option value="all">All types</option>
            <option value="doctor">Doctors</option>
            <option value="nurse">Nurses</option>
            <option value="hospital">Hospitals</option>
            <option value="medicine">Medicines</option>
            <option value="blog">Blog / medical news</option>
          </select>
          <select className="input" value={filters.sort} onChange={(e) => set("sort", e.target.value)}>
            <option value="relevance">Sort: relevance</option>
            <option value="rating">Sort: rating</option>
            <option value="distance">Sort: distance</option>
            <option value="price_asc">Sort: price ↑</option>
            <option value="price_desc">Sort: price ↓</option>
            <option value="experience">Sort: experience</option>
          </select>
          <button className="btn btn-primary" type="submit" disabled={loading}>
            {loading ? "Searching…" : "Search"}
          </button>
          <button className="btn btn-ghost" type="button" onClick={() => setShowAdvanced((s) => !s)}>
            {showAdvanced ? "Hide filters" : "All filters"}
          </button>
        </div>

        {showAdvanced && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
              gap: "0.75rem",
              marginTop: "1rem",
            }}
          >
            <label className="label">
              Disease
              <input className="input" value={filters.disease} onChange={(e) => set("disease", e.target.value)} placeholder="e.g. hypertension" />
            </label>
            <label className="label">
              Symptoms
              <input className="input" value={filters.symptoms} onChange={(e) => set("symptoms", e.target.value)} placeholder="e.g. fever cough" />
            </label>
            <label className="label">
              Medication
              <input className="input" value={filters.medication} onChange={(e) => set("medication", e.target.value)} placeholder="drug name" />
            </label>
            <label className="label">
              Insurance
              <input className="input" value={filters.insurance} onChange={(e) => set("insurance", e.target.value)} placeholder="国民健康保険" />
            </label>
            <label className="label">
              Location
              <input className="input" value={filters.location} onChange={(e) => set("location", e.target.value)} placeholder="Tokyo / Marunouchi" />
            </label>
            <label className="label">
              Max distance (km)
              <input className="input" type="number" value={filters.maxDistanceKm} onChange={(e) => set("maxDistanceKm", e.target.value)} />
            </label>
            <label className="label">
              Min price (¥)
              <input className="input" type="number" value={filters.minPrice} onChange={(e) => set("minPrice", e.target.value)} />
            </label>
            <label className="label">
              Max price (¥)
              <input className="input" type="number" value={filters.maxPrice} onChange={(e) => set("maxPrice", e.target.value)} />
            </label>
            <label className="label">
              Min rating
              <input className="input" type="number" step="0.1" min="0" max="5" value={filters.minRating} onChange={(e) => set("minRating", e.target.value)} />
            </label>
            <label className="label">
              Min experience (years)
              <input className="input" type="number" value={filters.minExperience} onChange={(e) => set("minExperience", e.target.value)} />
            </label>
            <label className="label">
              Language
              <input className="input" value={filters.language} onChange={(e) => set("language", e.target.value)} placeholder="English / 日本語" />
            </label>
            <label className="label">
              Availability
              <select className="input" value={filters.availability} onChange={(e) => set("availability", e.target.value)}>
                <option value="">Any</option>
                <option value="online">Online</option>
                <option value="offline">In-person</option>
                <option value="home_visit">Home visit</option>
              </select>
            </label>
            <label className="label">
              Gender
              <select className="input" value={filters.gender} onChange={(e) => set("gender", e.target.value)}>
                <option value="">Any</option>
                <option value="female">Female</option>
                <option value="male">Male</option>
                <option value="other">Other</option>
              </select>
            </label>
            <label className="label">
              Department
              <input className="input" value={filters.department} onChange={(e) => set("department", e.target.value)} placeholder="循環器 / Cardiology" />
            </label>
            <label className="label">
              Treatment methods
              <input className="input" value={filters.treatment} onChange={(e) => set("treatment", e.target.value)} placeholder="ECG / counseling" />
            </label>
            <label className="label" style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginTop: "1.5rem" }}>
              <input type="checkbox" checked={filters.onlineConsultation} onChange={(e) => set("onlineConsultation", e.target.checked)} />
              Online consultation
            </label>
            <label className="label" style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginTop: "1.5rem" }}>
              <input type="checkbox" checked={filters.homeVisit} onChange={(e) => set("homeVisit", e.target.checked)} />
              Home visit
            </label>
            <label className="label" style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginTop: "1.5rem" }}>
              <input type="checkbox" checked={filters.emergencySupport} onChange={(e) => set("emergencySupport", e.target.checked)} />
              Emergency support
            </label>
          </div>
        )}
        <p className="muted" style={{ marginTop: "0.75rem", fontSize: "0.85rem" }}>
          Location for distance:{" "}
          {coords.lat != null ? `${coords.lat.toFixed(4)}, ${coords.lng?.toFixed(4)}` : "detecting…"}
          {" · "}
          <Link href="/recommendations">Open personalized recommendations</Link>
        </p>
      </form>

      {results?.diseases && results.diseases.length > 0 && (
        <div className="panel" style={{ marginTop: "1rem" }}>
          <h2 style={{ marginTop: 0 }}>Matched diseases</h2>
          {results.diseases.map((d) => (
            <div key={d.name} style={{ marginBottom: "0.35rem" }}>
              <strong>{d.name}</strong>
              <span className="muted"> → {d.specialties.join(", ")}</span>
            </div>
          ))}
        </div>
      )}

      {results && (
        <div className="two-col-grid" style={{ marginTop: "1.25rem" }}>
          {(filters.type === "all" || filters.type === "doctor") && (
            <div className="panel">
              <h2 style={{ marginTop: 0 }}>Doctors ({results.doctors?.length || 0})</h2>
              {results.doctors?.length === 0 && <p className="muted">No doctors found.</p>}
              {results.doctors?.map((d) => (
                <div key={d.id} style={{ marginBottom: "0.85rem" }}>
                  <Link href={`/profile/${d.userId}`} className="profile-link">
                    {d.photoUrl && <img src={d.photoUrl} alt="" className="avatar-sm" />}
                    {d.name} — {d.specialty}
                  </Link>
                  <div className="muted" style={{ fontSize: "0.85rem" }}>
                    {d.avgRating != null ? `★ ${d.avgRating}` : "No ratings"}
                    {d.consultationFee != null ? ` · ¥${d.consultationFee}` : ""}
                    {d.yearsExperience != null ? ` · ${d.yearsExperience}y exp` : ""}
                    {d.languages ? ` · ${d.languages}` : ""}
                    {d.gender ? ` · ${d.gender}` : ""}
                    {d.onlineAvailable ? " · Online" : ""}
                    {d.treatmentMethods ? ` · ${d.treatmentMethods}` : ""}
                    {d.score != null ? ` · score ${Math.round(d.score)}` : ""}
                  </div>
                </div>
              ))}
            </div>
          )}

          {(filters.type === "all" || filters.type === "nurse") && (
            <div className="panel">
              <h2 style={{ marginTop: 0 }}>Nurses ({results.nurses?.length || 0})</h2>
              {results.nurses?.length === 0 && <p className="muted">No nurses found.</p>}
              {results.nurses?.map((n) => (
                <div key={n.id} style={{ marginBottom: "0.85rem" }}>
                  <Link href={`/profile/${n.userId}`} className="profile-link">
                    {n.name} — {n.clinicalSpecialties || n.specialty}
                  </Link>
                  <div className="muted" style={{ fontSize: "0.85rem" }}>
                    {n.avgRating != null ? `★ ${n.avgRating}` : "No ratings"}
                    {n.homeVisitAvailable ? " · Home visit" : ""}
                    {n.onlineAvailable ? " · Online" : ""}
                    {n.languages ? ` · ${n.languages}` : ""}
                    {n.yearsExperience != null ? ` · ${n.yearsExperience}y` : ""}
                  </div>
                </div>
              ))}
            </div>
          )}

          {(filters.type === "all" || filters.type === "hospital") && (
            <div className="panel">
              <h2 style={{ marginTop: 0 }}>Hospitals ({results.hospitals?.length || 0})</h2>
              {results.hospitals?.length === 0 && <p className="muted">No hospitals found.</p>}
              {results.hospitals?.map((h) => (
                <div key={h.id} style={{ marginBottom: "0.85rem" }}>
                  <Link href={`/profile/${h.userId}`}>
                    <strong>{h.name}</strong>
                  </Link>
                  <p className="muted" style={{ margin: 0 }}>
                    {h.departments}
                  </p>
                  <div className="muted" style={{ fontSize: "0.85rem" }}>
                    {h.address || ""}
                    {h.distanceKm != null ? ` · ${h.distanceKm} km` : ""}
                    {h.avgRating != null ? ` · ★ ${h.avgRating}` : ""}
                    {h.emergencyAvailable ? " · Emergency" : ""}
                    {h.acceptedInsurance ? ` · ${h.acceptedInsurance.slice(0, 40)}…` : ""}
                    {h.languages ? ` · ${h.languages}` : ""}
                  </div>
                </div>
              ))}
            </div>
          )}

          {(filters.type === "all" || filters.type === "medicine") && (
            <div className="panel">
              <h2 style={{ marginTop: 0 }}>Medicines ({results.medicines?.length || 0})</h2>
              {results.medicines?.map((m) => (
                <div key={m.id} style={{ marginBottom: "0.5rem" }}>
                  {m.name} — ¥{m.priceYen.toLocaleString()} · stock {m.stock}
                  <div className="muted" style={{ fontSize: "0.85rem" }}>
                    {m.manufacturer || ""} {m.ingredients ? `· ${m.ingredients}` : ""}{" "}
                    {m.pharmacyName ? `· ${m.pharmacyName}` : ""}
                  </div>
                </div>
              ))}
              <Link href="/marketplace" className="btn btn-ghost" style={{ marginTop: "0.5rem" }}>
                Browse marketplace
              </Link>
            </div>
          )}

          {(filters.type === "all" || filters.type === "blog") && (
            <div className="panel">
              <h2 style={{ marginTop: 0 }}>Articles ({results.blogs?.length || 0})</h2>
              {results.blogs?.map((b) => (
                <div key={b.id} style={{ marginBottom: "0.5rem" }}>
                  <Link href={`/blog/${b.id}`}>
                    <strong>{b.title}</strong>
                  </Link>
                  <div className="muted" style={{ fontSize: "0.85rem" }}>
                    {b.authorName || ""} {b.authorRole ? `· ${b.authorRole}` : ""}{" "}
                    {b.category ? `· ${b.category}` : ""}{" "}
                    {b.tags ? `· ${b.tags}` : ""} · ♥ {b.likeCount ?? 0}
                  </div>
                </div>
              ))}
              <Link href="/blog" className="btn btn-ghost" style={{ marginTop: "0.5rem" }}>
                Open blog
              </Link>
            </div>
          )}
        </div>
      )}
    </PageShell>
  );
}
