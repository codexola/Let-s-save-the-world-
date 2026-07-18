"use client";

import { useEffect, useState } from "react";
import { PageShell } from "@/components/page-shell";

type CorporateData = {
  profile: { name: string; employeeCount: number } | null;
  employeeCount: number;
  campaigns: Array<{ id: string; name: string; participation: number; status: string }>;
};

export default function CorporateDashboardPage() {
  const [data, setData] = useState<CorporateData | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/corporate")
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setError(d.error);
        else setData(d);
      });
  }, []);

  async function sendReminder(campaignId: string) {
    const res = await fetch("/api/corporate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "vaccination_reminder",
        campaignId,
        message: "Please schedule your annual flu vaccination via MedCare.",
      }),
    });
    const d = await res.json();
    setMessage(res.ok ? d.message : d.error);
  }

  return (
    <PageShell
      eyebrow="Corporate Healthcare"
      title="Employee health programs"
      description="Workforce size, wellness campaigns, and vaccination reminders."
    >
      {error && <p className="error-text">{error}</p>}
      {message && <p className="muted">{message}</p>}

      {data && (
        <>
          <div className="feature-grid">
            <div className="panel">
              <p className="badge">Employees</p>
              <h3>{data.employeeCount.toLocaleString()}</h3>
              <p className="muted">{data.profile?.name || "Company"}</p>
            </div>
            <div className="panel">
              <p className="badge">Campaigns</p>
              <h3>{data.campaigns.length}</h3>
              <p className="muted">Active wellness programs</p>
            </div>
          </div>

          <div className="panel" style={{ marginTop: "1.25rem" }}>
            <h2 style={{ marginTop: 0 }}>Campaigns</h2>
            <table className="table">
              <thead>
                <tr>
                  <th>Campaign</th>
                  <th>Participation</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.campaigns.map((c) => (
                  <tr key={c.id}>
                    <td>{c.name}</td>
                    <td>{c.participation}%</td>
                    <td><span className="badge">{c.status}</span></td>
                    <td>
                      <button className="btn btn-ghost" type="button" onClick={() => sendReminder(c.id)}>
                        Send reminder
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </PageShell>
  );
}
