"use client";

import { useEffect, useState } from "react";
import { PageShell } from "@/components/page-shell";

type Course = {
  id: string;
  title: string;
  type: string;
  description: string | null;
  cmeCredits: number;
  durationMin: number;
  mediaUrl: string | null;
  quizzes: Array<{ id: string; question: string }>;
};

export default function EducationPage() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [conferences, setConferences] = useState<Array<{ id: string; title: string; location: string | null; startsAt: string | null }>>([]);
  const [certificates, setCertificates] = useState<Array<{ publicCode: string; cmeCredits: number; course: { title: string } }>>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function load() {
    const res = await fetch("/api/education");
    const d = await res.json();
    if (d.error && !d.courses) setError(d.error);
    setCourses(d.courses || []);
    setConferences(d.conferences || []);
    setCertificates(d.certificates || []);
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <PageShell
      eyebrow="Learning"
      title="Medical education platform"
      description="Courses · training videos · conferences · certification · CME · simulation · case studies · quizzes · certificates."
    >
      {error && <p className="error-text">{error}</p>}
      {message && <p className="muted">{message}</p>}

      <h3>Medical conferences</h3>
      {conferences.map((c) => (
        <div key={c.id} className="panel" style={{ marginBottom: "0.5rem" }}>
          <strong>{c.title}</strong>
          <p className="muted">
            {c.location} · {c.startsAt ? new Date(c.startsAt).toLocaleString() : "TBA"}
          </p>
        </div>
      ))}

      <h3>Courses & training</h3>
      <div className="feature-grid">
        {courses.map((c) => (
          <div key={c.id} className="panel">
            <p className="badge">{c.type.replace(/_/g, " ")}</p>
            <h3 style={{ marginTop: 0 }}>{c.title}</h3>
            <p className="muted">{c.description}</p>
            <p>
              {c.cmeCredits} CME credits · {c.durationMin} min · {c.quizzes.length} quiz items
            </p>
            {c.mediaUrl && (
              <p className="muted">
                <a href={c.mediaUrl} target="_blank" rel="noreferrer">
                  Training video / media
                </a>
              </p>
            )}
            <button
              className="btn"
              type="button"
              onClick={async () => {
                await fetch("/api/education", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ action: "enroll", courseId: c.id }),
                });
                setMessage(`Enrolled in ${c.title}`);
              }}
            >
              Enroll / continue
            </button>
            <button
              className="btn btn-primary"
              type="button"
              onClick={async () => {
                const res = await fetch("/api/education", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    action: "quiz",
                    courseId: c.id,
                    answers: c.quizzes.map(() => 0),
                  }),
                });
                const d = await res.json();
                if (!res.ok) setError(d.error);
                else {
                  setMessage(
                    `Quiz score ${d.score}%${d.certificate ? ` · Certificate ${d.certificate.publicCode}` : ""}`
                  );
                  load();
                }
              }}
            >
              Take quiz → certificate
            </button>
          </div>
        ))}
      </div>

      <h3>Your certificates</h3>
      {certificates.map((c) => (
        <p key={c.publicCode}>
          {c.course.title} — {c.publicCode} ({c.cmeCredits} CME)
        </p>
      ))}
      {certificates.length === 0 && <p className="muted">Complete a quiz to earn a certificate.</p>}
    </PageShell>
  );
}
