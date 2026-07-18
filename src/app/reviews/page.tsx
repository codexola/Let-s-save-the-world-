"use client";

import { FormEvent, useEffect, useState } from "react";
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
  const [targetId, setTargetId] = useState("");
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [submitMsg, setSubmitMsg] = useState("");
  const [submitErr, setSubmitErr] = useState("");

  function load() {
    fetch("/api/reviews?mutual=1")
      .then((r) => r.json())
      .then((d) => {
        if (d.error) return;
        setGiven(d.given || []);
        setReceived(d.received || []);
        setMutual(d.mutualReviews || []);
      });
  }

  useEffect(() => {
    load();
  }, []);

  async function submitReview(e: FormEvent) {
    e.preventDefault();
    setSubmitMsg("");
    setSubmitErr("");
    const res = await fetch("/api/reviews", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetType: "user", targetId, rating, comment }),
    });
    const data = await res.json();
    if (!res.ok) {
      setSubmitErr(data.error || "Failed — sign in required");
      return;
    }
    setSubmitMsg("Review submitted");
    setTargetId("");
    setComment("");
    load();
  }

  return (
    <PageShell
      eyebrow="Reviews"
      title="Browse & submit reviews"
      description="Verified reviews and mutual review pairs across the platform."
    >
      <form className="panel form-narrow" onSubmit={submitReview} style={{ marginBottom: "1.5rem" }}>
        <h2 style={{ marginTop: 0 }}>Submit a review</h2>
        <label className="label">Target user ID</label>
        <input className="input" value={targetId} onChange={(e) => setTargetId(e.target.value)} required />
        <label className="label">Rating (1–5)</label>
        <input
          className="input"
          type="number"
          min={1}
          max={5}
          value={rating}
          onChange={(e) => setRating(Number(e.target.value))}
          required
        />
        <label className="label">Comment</label>
        <textarea className="input" rows={3} value={comment} onChange={(e) => setComment(e.target.value)} />
        {submitErr && <p className="error-text">{submitErr}</p>}
        {submitMsg && <p className="muted">{submitMsg}</p>}
        <button className="btn btn-primary form-submit" type="submit">Submit review</button>
      </form>

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
