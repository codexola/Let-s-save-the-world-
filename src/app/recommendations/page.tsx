"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PageShell } from "@/components/page-shell";

type RecItem = {
  userId: string;
  name: string;
  specialty?: string | null;
  clinicalSpecialties?: string | null;
  departments?: string | null;
  score: number;
  reasons: string[];
  avgRating?: number | null;
  distanceKm?: number | null;
  consultationFee?: number | null;
  onlineAvailable?: boolean;
  homeVisitAvailable?: boolean;
  emergencyAvailable?: boolean;
  successRate?: number | null;
};

type RecommendPayload = {
  doctors: RecItem[];
  nurses: RecItem[];
  hospitals: RecItem[];
  profileUsed: {
    age: number | null;
    gender: string | null;
    medicalHistory: string | null;
    insurance: string | null;
    incomeBracket: string | null;
    preferredLanguage: string | null;
    favoriteDoctors: string[];
    pastDoctorIds: string[];
    conditionHints: string[];
  };
  weights: Record<string, number>;
  error?: string;
  disclaimer?: string;
};

function CardList({ title, items, kind }: { title: string; items: RecItem[]; kind: string }) {
  return (
    <div className="panel">
      <h2 style={{ marginTop: 0 }}>{title}</h2>
      {items.length === 0 && <p className="muted">No recommendations yet — update your profile and history.</p>}
      {items.map((item) => (
        <div key={`${kind}-${item.userId}`} style={{ marginBottom: "1rem" }}>
          <Link href={`/profile/${item.userId}`} className="profile-link">
            <strong>{item.name}</strong>
          </Link>
          <div className="muted" style={{ fontSize: "0.9rem" }}>
            {item.specialty || item.clinicalSpecialties || item.departments || ""}
            {item.avgRating != null ? ` · ★ ${item.avgRating}` : ""}
            {item.consultationFee != null ? ` · ¥${item.consultationFee}` : ""}
            {item.distanceKm != null ? ` · ${item.distanceKm} km` : ""}
            {item.onlineAvailable ? " · Online" : ""}
            {item.homeVisitAvailable ? " · Home visit" : ""}
            {item.emergencyAvailable ? " · Emergency" : ""}
            {item.successRate != null ? ` · success ${item.successRate}%` : ""}
            {` · score ${Math.round(item.score)}`}
          </div>
          <ul style={{ margin: "0.35rem 0 0", paddingLeft: "1.1rem", fontSize: "0.85rem" }}>
            {item.reasons.slice(0, 6).map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

export default function RecommendationsPage() {
  const [data, setData] = useState<RecommendPayload | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load(lat?: number, lng?: number) {
      setLoading(true);
      const params = new URLSearchParams();
      if (lat != null) params.set("latitude", String(lat));
      if (lng != null) params.set("longitude", String(lng));
      const res = await fetch(`/api/recommend?${params}`);
      const json = await res.json();
      if (cancelled) return;
      if (!res.ok) {
        setError(json.error || "Failed to load recommendations");
        setLoading(false);
        return;
      }
      setData(json);
      setLoading(false);
    }

    if (typeof navigator !== "undefined" && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => load(pos.coords.latitude, pos.coords.longitude),
        () => load(35.6812, 139.7671)
      );
    } else {
      load(35.6812, 139.7671);
    }
    return () => {
      cancelled = true;
    };
  }, []);

  const p = data?.profileUsed;

  return (
    <PageShell
      eyebrow="Recommendation Engine"
      title="Personalized care recommendations"
      description="Ranked using medical condition, age, gender, history, income, insurance, language, distance, reviews, appointments, preferred doctors, availability, AI scoring, popularity, and treatment success."
    >
      {error && (
        <div className="panel">
          <p className="error-text">{error}</p>
          <Link href="/login" className="btn btn-primary">
            Sign in
          </Link>
        </div>
      )}
      {loading && <p className="muted">Building personalized rankings…</p>}
      {data && !error && (
        <>
          <div className="panel" style={{ marginBottom: "1.25rem" }}>
            <h2 style={{ marginTop: 0 }}>Signals used from your profile</h2>
            <p className="muted" style={{ margin: 0 }}>
              Age: {p?.age ?? "—"} · Gender: {p?.gender ?? "—"} · Language: {p?.preferredLanguage ?? "—"} ·
              Income: {p?.incomeBracket ?? "—"}
            </p>
            <p className="muted">Insurance: {p?.insurance || "—"}</p>
            <p className="muted">History: {p?.medicalHistory || "—"}</p>
            <p className="muted">
              Preferred doctors: {p?.favoriteDoctors?.join(", ") || "—"} · Past appointments:{" "}
              {p?.pastDoctorIds?.length || 0}
            </p>
            <p className="muted">Condition hints: {p?.conditionHints?.slice(0, 4).join(" · ") || "—"}</p>
            {data.disclaimer && <p className="muted">{data.disclaimer}</p>}
            <p style={{ marginTop: "0.75rem" }}>
              <Link href="/search" className="btn btn-ghost">
                Faceted search
              </Link>{" "}
              <Link href="/patient" className="btn btn-ghost">
                Update profile
              </Link>
            </p>
          </div>

          <div className="two-col-grid">
            <CardList title="Recommended doctors" items={data.doctors} kind="doctor" />
            <CardList title="Recommended nurses" items={data.nurses} kind="nurse" />
            <CardList title="Recommended hospitals" items={data.hospitals} kind="hospital" />
            <div className="panel">
              <h2 style={{ marginTop: 0 }}>Scoring weights</h2>
              <ul style={{ margin: 0, paddingLeft: "1.1rem", fontSize: "0.9rem" }}>
                {Object.entries(data.weights || {}).map(([k, v]) => (
                  <li key={k}>
                    {k}: {v}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </>
      )}
    </PageShell>
  );
}
