"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PageShell } from "@/components/page-shell";

type Review = {
  id: string;
  rating: number;
  comment: string | null;
  targetType: string;
  author: { id: string; name: string; photoUrl?: string | null };
};

export default function ReviewsBrowsePage() {
  const [given, setGiven] = useState<Review[]>([]);
  const [received, setReceived] = useState<Review[]>([]);
  const [mutual, setMutual] = useState<
    Array<{ partner: { id: string; name: string; photoUrl?: string | null }; given: Review; received: Review }>
  >([]);

  useEffect(() => {
    fetch("/api/reviews?mutual=1")
      .then((r) => r.json())
      .then((d) => {
        if (d.error) return;
        setGiven(d.given || []);
        setReceived(d.received || []);
        setMutual(d.mutualReviews || []);
      });
  }, []);

  return (
    <PageShell
      eyebrow="Reviews"
      title="Browse reviews"
      description="Verified reviews and mutual review pairs across the platform."
    >
      {mutual.length > 0 && (
        <section style={{ marginBottom: "1.5rem" }}>
          <h2>Mutual reviews</h2>
          {mutual.map((m) => (
            <div key={m.given.id} className="panel" style={{ marginBottom: "0.75rem" }}>
              <Link href={`/profile/${m.partner.id}`} className="profile-link">
                {m.partner.photoUrl && <img src={m.partner.photoUrl} alt="" className="avatar-sm" />}
                {m.partner.name}
              </Link>
              <p className="muted">Both parties reviewed each other</p>
            </div>
          ))}
        </section>
      )}

      <div className="two-col-grid">
        <div>
          <h2>Given</h2>
          {given.length === 0 && <p className="muted">Sign in to see your reviews.</p>}
          {given.map((r) => (
            <div key={r.id} className="panel" style={{ marginBottom: "0.5rem" }}>
              {"★".repeat(r.rating)} — {r.comment}
            </div>
          ))}
        </div>
        <div>
          <h2>Received</h2>
          {received.map((r) => (
            <div key={r.id} className="panel" style={{ marginBottom: "0.5rem" }}>
              {r.author.photoUrl && <img src={r.author.photoUrl} alt="" className="avatar-sm" />}
              <strong>{r.author.name}</strong> {"★".repeat(r.rating)}
              <p>{r.comment}</p>
            </div>
          ))}
        </div>
      </div>
    </PageShell>
  );
}
