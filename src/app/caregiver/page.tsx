"use client";

import { FormEvent, useEffect, useState } from "react";
import { PageShell } from "@/components/page-shell";

type Caregiver = {
  id: string;
  userId: string;
  qualifications: string | null;
  availability: string | null;
  experienceYears: number;
  languages: string | null;
  services: string | null;
  hourlyRateYen: number;
  ratingAvg: number;
  reviewCount: number;
  bio: string | null;
  user: { id: string; name: string };
  reviews: Array<{ rating: number; body: string | null }>;
};

type Booking = {
  id: string;
  service: string;
  scheduledAt: string;
  hours: number;
  amountYen: number;
  paid: boolean;
  status: string;
  paymentRef: string | null;
  caregiverUser: { name: string };
};

export default function CaregiverPage() {
  const [services, setServices] = useState<string[]>([]);
  const [caregivers, setCaregivers] = useState<Caregiver[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [caregiverUserId, setCaregiverUserId] = useState("");
  const [service, setService] = useState("daily_care");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function load() {
    const res = await fetch("/api/caregiver");
    const d = await res.json();
    if (!res.ok) {
      setError(d.error || "Sign in required");
      return;
    }
    setServices(d.services || []);
    setCaregivers(d.caregivers || []);
    setBookings(d.bookings || []);
    if (d.caregivers?.[0]?.userId) setCaregiverUserId(d.caregivers[0].userId);
    if (d.services?.[0]) setService(d.services[0]);
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <PageShell
      eyebrow="Caregivers"
      title="Caregiver platform"
      description="Profiles with qualifications, availability, experience, languages & reviews — daily care, medical assistance, transportation, meals, companionship — scheduling and payment."
    >
      {error && <p className="error-text">{error}</p>}
      {message && <p className="muted">{message}</p>}

      <div className="feature-grid" style={{ marginBottom: "1rem" }}>
        {caregivers.map((c) => (
          <div key={c.id} className="panel">
            <h3 style={{ marginTop: 0 }}>{c.user.name}</h3>
            <p className="badge">
              ★ {c.ratingAvg.toFixed(1)} · {c.reviewCount} reviews · {c.experienceYears} yrs
            </p>
            <p>{c.bio}</p>
            <p className="muted">Qualifications: {c.qualifications}</p>
            <p className="muted">Availability: {c.availability}</p>
            <p className="muted">Languages: {c.languages}</p>
            <p className="muted">Services: {(c.services || "").replace(/_/g, " ")}</p>
            <p>¥{c.hourlyRateYen.toLocaleString()}/hr</p>
            {c.reviews[0] && <p className="muted">“{c.reviews[0].body}”</p>}
            <button className="btn" type="button" onClick={() => setCaregiverUserId(c.userId)}>
              Select
            </button>
          </div>
        ))}
      </div>

      <form
        className="panel form-narrow"
        style={{ marginBottom: "1rem" }}
        onSubmit={async (e: FormEvent) => {
          e.preventDefault();
          const res = await fetch("/api/caregiver", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "book",
              caregiverUserId,
              service,
              scheduledAt: new Date(Date.now() + 2 * 86400_000).toISOString(),
              hours: 3,
            }),
          });
          const d = await res.json();
          if (!res.ok) setError(d.error);
          else {
            setMessage(`Booked ${d.booking.service} · ¥${d.booking.amountYen}`);
            load();
          }
        }}
      >
        <h3 style={{ marginTop: 0 }}>Schedule caregiver</h3>
        <select className="input" value={service} onChange={(e) => setService(e.target.value)}>
          {services.map((s) => (
            <option key={s} value={s}>
              {s.replace(/_/g, " ")}
            </option>
          ))}
        </select>
        <button className="btn btn-primary form-submit" type="submit">
          Book
        </button>
      </form>

      <h3>Bookings & payment</h3>
      {bookings.map((b) => (
        <div key={b.id} className="panel" style={{ marginBottom: "0.5rem" }}>
          <strong>
            {b.caregiverUser.name} — {b.service.replace(/_/g, " ")}{" "}
            <span className="badge">{b.status}</span>
          </strong>
          <p className="muted">
            {new Date(b.scheduledAt).toLocaleString()} · {b.hours}h · ¥{b.amountYen.toLocaleString()} ·{" "}
            {b.paid ? `Paid ${b.paymentRef}` : "Unpaid"}
          </p>
          {!b.paid && (
            <button
              className="btn btn-primary"
              type="button"
              onClick={async () => {
                const res = await fetch("/api/caregiver", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ action: "pay", id: b.id }),
                });
                const d = await res.json();
                if (!res.ok) setError(d.error);
                else {
                  setMessage(`Paid ${d.booking.paymentRef}`);
                  load();
                }
              }}
            >
              Pay now
            </button>
          )}
        </div>
      ))}
    </PageShell>
  );
}
