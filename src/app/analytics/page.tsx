"use client";

import { useEffect, useState } from "react";
import { PageShell } from "@/components/page-shell";

type Stats = {
  users: number;
  appointments: number;
  activeSubscriptions: number;
  aiConsultations: number;
  emergencies: number;
  featuresEnabled: number;
  publishedBlogPosts: number;
  prescriptions: number;
  openInvoices: number;
  telemedicineSessions: number;
  communityPosts: number;
  medicinesListed: number;
};

export default function AnalyticsPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/analytics")
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setError(d.error);
        else setStats(d.stats);
      });
  }, []);

  const cards: Array<{ label: string; value: number | undefined }> = [
    { label: "Users", value: stats?.users },
    { label: "Appointments", value: stats?.appointments },
    { label: "Active subscriptions", value: stats?.activeSubscriptions },
    { label: "AI consultations", value: stats?.aiConsultations },
    { label: "Emergencies", value: stats?.emergencies },
    { label: "Features enabled", value: stats?.featuresEnabled },
    { label: "Blog posts", value: stats?.publishedBlogPosts },
    { label: "Prescriptions", value: stats?.prescriptions },
    { label: "Open invoices", value: stats?.openInvoices },
    { label: "Telemedicine sessions", value: stats?.telemedicineSessions },
    { label: "Community posts", value: stats?.communityPosts },
    { label: "Medicines listed", value: stats?.medicinesListed },
  ];

  return (
    <PageShell
      eyebrow="Analytics"
      title="Platform analytics"
      description="Operational metrics across MedCare modules."
    >
      {error && <p className="error-text">{error}</p>}
      <div className="feature-grid">
        {cards.map((c) => (
          <div key={c.label} className="panel">
            <p className="badge">{c.label}</p>
            <h3>{c.value ?? "—"}</h3>
          </div>
        ))}
      </div>
    </PageShell>
  );
}
