"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { PageShell } from "@/components/page-shell";

export default function ResearchPage() {
  const [data, setData] = useState<{
    datasets: Array<{ id: string; title: string; institution: string | null; recordCount: number; accessLevel: string }>;
    papers: Array<{ id: string; title: string; status: string; doi: string | null; author?: { name: string } }>;
    grants: Array<{ id: string; title: string; agency: string | null; amountYen: number; status: string }>;
    collaborations: Array<{ id: string; title: string; orgType: string; orgName: string }>;
    trialsForRecruitment: Array<{ id: string; title: string }>;
    organizations?: {
      hospitals: Array<{ id: string; name: string; address: string | null }>;
      universities: Array<{ name: string; type: string; collaboration?: string }>;
      researchers: Array<{ id: string; name: string; role: string; verified: boolean }>;
    };
  } | null>(null);
  const [analysis, setAnalysis] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function load() {
    const res = await fetch("/api/research");
    const d = await res.json();
    if (!res.ok) setError(d.error);
    else setData(d);
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <PageShell
      eyebrow="Research"
      title="Research platform"
      description="Hospitals, universities, and researchers can share datasets, publish papers, collaborate, recruit participants, manage grants, run AI analysis, and share knowledge."
    >
      {error && <p className="error-text">{error}</p>}
      {message && <p className="muted">{message}</p>}
      <p className="muted">
        Participant recruitment: <Link href="/trials">Clinical Trials</Link>
      </p>

      <form
        className="panel form-narrow"
        style={{ marginBottom: "1rem" }}
        onSubmit={async (e: FormEvent) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget as HTMLFormElement);
          const res = await fetch("/api/research", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "share_dataset",
              title: fd.get("title"),
              institution: fd.get("institution"),
              recordCount: Number(fd.get("n") || 0),
              accessLevel: "restricted",
            }),
          });
          const d = await res.json();
          if (!res.ok) setError(d.error);
          else {
            setMessage("Dataset shared");
            load();
          }
        }}
      >
        <h3 style={{ marginTop: 0 }}>Share dataset</h3>
        <input className="input" name="title" required placeholder="Dataset title" />
        <input className="input" name="institution" placeholder="Hospital / University" />
        <input className="input" name="n" type="number" placeholder="Record count" />
        <button className="btn btn-primary form-submit" type="submit">
          Share
        </button>
      </form>

      <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", marginBottom: "1rem" }}>
        <button
          className="btn"
          type="button"
          onClick={async () => {
            await fetch("/api/research", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                action: "publish_paper",
                title: "MedCare collaborative methods note",
                abstract: "Knowledge sharing preprint demo.",
                institution: "University partner",
              }),
            });
            load();
            setMessage("Paper published");
          }}
        >
          Publish paper
        </button>
        <button
          className="btn"
          type="button"
          onClick={async () => {
            await fetch("/api/research", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                action: "manage_grant",
                title: "Pilot digital health grant",
                agency: "MEXT",
                amountYen: 5000000,
              }),
            });
            load();
            setMessage("Grant recorded");
          }}
        >
          Manage grant
        </button>
        <button
          className="btn"
          type="button"
          onClick={async () => {
            await fetch("/api/research", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                action: "collaborate",
                title: "New hospital–university collaboration",
                orgType: "university",
                orgName: "Partner University",
              }),
            });
            load();
          }}
        >
          Collaborate
        </button>
      </div>

      {data && (
        <>
          {data.organizations && (
            <>
              <h3>Hospitals · Universities · Researchers</h3>
              <div className="feature-grid" style={{ marginBottom: "1rem" }}>
                {data.organizations.hospitals.map((h) => (
                  <div key={h.id} className="panel">
                    <p className="badge">Hospital</p>
                    <strong>{h.name}</strong>
                    <p className="muted">{h.address || "—"}</p>
                  </div>
                ))}
                {data.organizations.universities.map((u) => (
                  <div key={u.name} className="panel">
                    <p className="badge">University</p>
                    <strong>{u.name}</strong>
                    <p className="muted">{u.collaboration || "Partner"}</p>
                  </div>
                ))}
                {data.organizations.researchers.map((r) => (
                  <div key={r.id} className="panel">
                    <p className="badge">{r.role}</p>
                    <strong>{r.name}</strong>
                    <p className="muted">{r.verified ? "Verified" : "Pending verification"}</p>
                  </div>
                ))}
              </div>
            </>
          )}

          <h3>Datasets</h3>
          {data.datasets.map((d) => (
            <div key={d.id} className="panel" style={{ marginBottom: "0.5rem" }}>
              <strong>{d.title}</strong>
              <p className="muted">
                {d.institution} · n={d.recordCount} · {d.accessLevel}
              </p>
              <button
                className="btn"
                type="button"
                onClick={async () => {
                  const res = await fetch("/api/research", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ action: "ai_analysis", datasetId: d.id }),
                  });
                  const r = await res.json();
                  setAnalysis(JSON.stringify(r.analysis, null, 2));
                }}
              >
                AI analysis
              </button>
            </div>
          ))}
          {analysis && (
            <pre className="panel" style={{ whiteSpace: "pre-wrap", fontSize: "0.85rem" }}>
              {analysis}
            </pre>
          )}

          <h3>Published papers</h3>
          {data.papers.map((p) => (
            <p key={p.id}>
              {p.title} — {p.author?.name} · {p.status} {p.doi || ""}
            </p>
          ))}

          <h3>Grants</h3>
          {data.grants.map((g) => (
            <p key={g.id}>
              {g.title} ({g.agency}) ¥{g.amountYen.toLocaleString()} — {g.status}
            </p>
          ))}

          <h3>Collaborations</h3>
          {data.collaborations.map((c) => (
            <p key={c.id}>
              [{c.orgType}] {c.orgName}: {c.title}
            </p>
          ))}

          <h3>Recruit participants</h3>
          {data.trialsForRecruitment.map((t) => (
            <p key={t.id}>
              <Link href="/trials">{t.title}</Link>
            </p>
          ))}
        </>
      )}
    </PageShell>
  );
}
