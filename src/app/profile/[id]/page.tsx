"use client";

import { useEffect, useState } from "react";
import { PageShell } from "@/components/page-shell";

type Review = {
  id: string;
  rating: number;
  comment: string | null;
  author: { id: string; name: string; photoUrl?: string | null };
};

type Profile = {
  id: string;
  name: string;
  photoUrl?: string | null;
  bio?: string | null;
  role: string;
  doctorProfile?: { specialty?: string | null } | null;
};

export default function ProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const [userId, setUserId] = useState("");
  const [user, setUser] = useState<Profile | null>(null);
  const [given, setGiven] = useState<Review[]>([]);
  const [received, setReceived] = useState<Review[]>([]);
  const [mutual, setMutual] = useState<
    Array<{ partner: { name: string; photoUrl?: string | null }; given: Review; received: Review }>
  >([]);

  useEffect(() => {
    params.then((p) => setUserId(p.id));
  }, [params]);

  useEffect(() => {
    if (!userId) return;
    fetch(`/api/users/${userId}`)
      .then((r) => r.json())
      .then((d) => {
        setUser(d.user);
        setGiven(d.given || []);
        setReceived(d.received || []);
        setMutual(d.mutualReviews || []);
      });
  }, [userId]);

  if (!user) {
    return (
      <PageShell eyebrow="Profile" title="Loading…" description="">
        <p className="muted">Loading profile…</p>
      </PageShell>
    );
  }

  return (
    <PageShell eyebrow={user.role} title={user.name} description={user.bio || ""}>
      <div className="panel role-welcome">
        {user.photoUrl && <img src={user.photoUrl} alt="" className="avatar-lg" />}
        <div>
          <h2 style={{ margin: 0 }}>{user.name}</h2>
          {user.doctorProfile?.specialty && (
            <p className="muted">{user.doctorProfile.specialty}</p>
          )}
          {user.bio && <p>{user.bio}</p>}
        </div>
      </div>

      {mutual.length > 0 && (
        <section style={{ marginTop: "1.5rem" }}>
          <h2>Mutual reviews</h2>
          {mutual.map((m) => (
            <div key={m.given.id} className="panel" style={{ marginBottom: "0.75rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                {m.partner.photoUrl && <img src={m.partner.photoUrl} alt="" className="avatar-sm" />}
                <strong>{m.partner.name}</strong>
              </div>
              <p>
                <strong>{user.name} wrote:</strong> {"★".repeat(m.given.rating)} — {m.given.comment}
              </p>
              <p>
                <strong>{m.partner.name} wrote:</strong> {"★".repeat(m.received.rating)} —{" "}
                {m.received.comment}
              </p>
            </div>
          ))}
        </section>
      )}

      <div className="two-col-grid" style={{ marginTop: "1.5rem" }}>
        <div>
          <h2>Reviews given</h2>
          {given.map((r) => (
            <div key={r.id} className="panel" style={{ marginBottom: "0.5rem" }}>
              {"★".repeat(r.rating)} — {r.comment}
            </div>
          ))}
        </div>
        <div>
          <h2>Reviews received</h2>
          {received.map((r) => (
            <div key={r.id} className="panel" style={{ marginBottom: "0.5rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                {r.author.photoUrl && <img src={r.author.photoUrl} alt="" className="avatar-sm" />}
                <strong>{r.author.name}</strong> {"★".repeat(r.rating)}
              </div>
              <p>{r.comment}</p>
            </div>
          ))}
        </div>
      </div>
    </PageShell>
  );
}
