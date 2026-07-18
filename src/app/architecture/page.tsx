import { PageShell } from "@/components/page-shell";

export default function ArchitecturePage() {
  return (
    <PageShell
      eyebrow="Technical Architecture"
      title="Modular monolith → microservices"
      description="Next.js web · Tailwind · service modules · Postgres/Redis roadmap · OpenSearch · object storage · message broker."
    >
      <div className="panel" style={{ marginBottom: "1rem" }}>
        <h2 style={{ marginTop: 0 }}>Stack</h2>
        <ul>
          <li>
            <strong>Frontend:</strong> Next.js (React) + Tailwind; mobile clients via the same REST APIs (Flutter / React Native)
          </li>
          <li>
            <strong>Backend:</strong> Logical services (Auth, User, Doctor, Hospital, Pharmacy, Search, AI, Appointment, Chat,
            Telemedicine, Prescription, Payment, Subscription, Notification, Blog, Analytics, Admin)
          </li>
          <li>
            <strong>Data (target):</strong> PostgreSQL · Redis · OpenSearch · S3 · Kafka/RabbitMQ
          </li>
          <li>
            <strong>Data (demo today):</strong> SQLite + in-process search + Vercel cron
          </li>
        </ul>
        <p className="muted">
          Full write-up: <code>docs/ARCHITECTURE.md</code>. Local infra: <code>docker-compose.yml</code> (Postgres + Redis).
        </p>
      </div>
      <div className="feature-grid">
        {[
          "Authentication Service",
          "User Service",
          "Doctor Service",
          "Hospital Service",
          "Pharmacy Service",
          "Search Service",
          "AI Recommendation Service",
          "Appointment Service",
          "Chat Service",
          "Telemedicine Service",
          "Prescription Service",
          "Payment Service",
          "Subscription Service",
          "Notification Service",
          "Blog Service",
          "Analytics Service",
          "Admin / GRC Service",
          "Privacy Service",
        ].map((s) => (
          <div key={s} className="panel">
            <p className="badge">service</p>
            <h3 style={{ margin: 0 }}>{s}</h3>
          </div>
        ))}
      </div>
    </PageShell>
  );
}
