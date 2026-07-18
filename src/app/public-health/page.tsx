"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { PageShell } from "@/components/page-shell";

export default function PublicHealthPage() {
  const [data, setData] = useState<{
    diseaseSurveillance: Array<{ disease: string; region: string; cases: number; severity: string }>;
    vaccinationStatistics: { completed: number; upcoming: number; activeCampaigns: number };
    regionalTrends: Array<{ region: string; influenza: number; covid: number; norovirus: number }>;
    hospitalCapacity: { realtime?: Record<string, number>; hospital?: { name: string } } | null;
    emergencyEvents: { last7Days: number };
    pandemicMonitoring: { status: string; indicators: Array<{ name: string; value: string | number; trend: string }> };
    outbreakAlerts: Array<{
      id?: string;
      disease: string;
      region: string;
      message: string;
      severity: string;
      caseCount: number;
    }>;
    governmentReporting: { title: string; sections: Record<string, unknown> };
    governmentReports?: Array<{ id: string; title: string; reportType: string; generatedAt: string }>;
  } | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function load() {
    const res = await fetch("/api/public-health");
    const d = await res.json();
    if (!res.ok) setError(d.error || "Sign in required");
    else setData(d);
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <PageShell
      eyebrow="Population health"
      title="Public health dashboard"
      description="Disease surveillance · vaccination statistics · regional trends · hospital capacity · emergency events · pandemic monitoring · government reporting · outbreak alerts."
    >
      {error && <p className="error-text">{error}</p>}
      {message && <p className="muted">{message}</p>}
      <p className="muted">
        Linked: <Link href="/beds">Bed management</Link> · <Link href="/vaccination">Vaccinations</Link> ·{" "}
        <Link href="/ems">EMS</Link>
      </p>

      <form
        className="panel form-narrow"
        style={{ marginBottom: "1rem" }}
        onSubmit={async (e: FormEvent) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget as HTMLFormElement);
          const res = await fetch("/api/public-health", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "create_outbreak",
              disease: fd.get("disease"),
              region: fd.get("region"),
              severity: fd.get("severity"),
              caseCount: Number(fd.get("cases") || 0),
              message: fd.get("message"),
            }),
          });
          const d = await res.json();
          if (!res.ok) setError(d.error);
          else {
            setMessage("Outbreak alert published");
            (e.target as HTMLFormElement).reset();
            load();
          }
        }}
      >
        <h3 style={{ marginTop: 0 }}>Issue outbreak alert</h3>
        <input className="input" name="disease" required placeholder="Disease" />
        <input className="input" name="region" required placeholder="Region" />
        <select className="input" name="severity" defaultValue="moderate">
          <option value="low">Low</option>
          <option value="moderate">Moderate</option>
          <option value="elevated">Elevated</option>
          <option value="high">High</option>
        </select>
        <input className="input" name="cases" type="number" placeholder="Case count" />
        <textarea className="input" name="message" required rows={2} placeholder="Advisory message" />
        <button className="btn btn-primary form-submit" type="submit">
          Publish alert
        </button>
      </form>

      <button
        className="btn"
        type="button"
        style={{ marginBottom: "1rem" }}
        onClick={async () => {
          const res = await fetch("/api/public-health", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "generate_report" }),
          });
          const d = await res.json();
          if (!res.ok) setError(d.error);
          else {
            setMessage(`Government report filed: ${d.report.title}`);
            load();
          }
        }}
      >
        Generate government report
      </button>

      {data && (
        <>
          <div className="feature-grid" style={{ marginBottom: "1rem" }}>
            <div className="panel">
              <p className="badge">Vaccination statistics</p>
              <p>Completed {data.vaccinationStatistics.completed}</p>
              <p>Upcoming {data.vaccinationStatistics.upcoming}</p>
              <p>Campaigns {data.vaccinationStatistics.activeCampaigns}</p>
            </div>
            <div className="panel">
              <p className="badge">Emergency events (7d)</p>
              <p style={{ fontSize: "2rem", margin: 0 }}>{data.emergencyEvents.last7Days}</p>
            </div>
            <div className="panel">
              <p className="badge">Hospital capacity</p>
              <p>{data.hospitalCapacity?.hospital?.name || "—"}</p>
              <p className="muted">
                Available {data.hospitalCapacity?.realtime?.availableBeds ?? "—"} · Occupancy{" "}
                {data.hospitalCapacity?.realtime?.occupancyPercent ?? "—"}%
              </p>
            </div>
            <div className="panel">
              <p className="badge">Pandemic monitoring</p>
              <p>{data.pandemicMonitoring.status}</p>
              {data.pandemicMonitoring.indicators.map((i) => (
                <p key={i.name} className="muted">
                  {i.name}: {i.value} ({i.trend})
                </p>
              ))}
            </div>
          </div>

          <h3>Disease surveillance</h3>
          <div className="feature-grid" style={{ marginBottom: "1rem" }}>
            {data.diseaseSurveillance.map((d) => (
              <div key={`${d.disease}-${d.region}`} className="panel">
                <strong>{d.disease}</strong>
                <p className="badge">{d.severity}</p>
                <p>
                  {d.region}: {d.cases} cases
                </p>
              </div>
            ))}
          </div>

          <h3>Regional trends</h3>
          <div className="feature-grid" style={{ marginBottom: "1rem" }}>
            {data.regionalTrends.map((r) => (
              <div key={r.region} className="panel">
                <strong>{r.region}</strong>
                <p className="muted">
                  Flu {r.influenza} · COVID {r.covid} · Noro {r.norovirus}
                </p>
              </div>
            ))}
          </div>

          <h3>Outbreak alerts</h3>
          {data.outbreakAlerts.map((a) => (
            <div key={a.id || a.disease + a.region} className="panel" style={{ marginBottom: "0.5rem" }}>
              <span className="badge">{a.severity}</span> <strong>{a.disease}</strong> — {a.region} ({a.caseCount})
              <p>{a.message}</p>
            </div>
          ))}

          <h3>Government reporting</h3>
          <div className="panel">
            <strong>{data.governmentReporting.title}</strong>
            <pre style={{ whiteSpace: "pre-wrap", fontSize: "0.8rem" }}>
              {JSON.stringify(data.governmentReporting.sections, null, 2)}
            </pre>
          </div>
          {(data.governmentReports || []).length > 0 && (
            <>
              <h4>Filed reports</h4>
              {data.governmentReports!.map((r) => (
                <p key={r.id} className="muted">
                  {r.title} · {r.reportType} · {new Date(r.generatedAt).toLocaleString()}
                </p>
              ))}
            </>
          )}
        </>
      )}
    </PageShell>
  );
}
