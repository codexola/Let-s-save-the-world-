"use client";

import { FormEvent, useEffect, useState } from "react";
import { PageShell } from "@/components/page-shell";

type Employee = {
  id: string;
  name: string;
  email: string;
  department: string | null;
  status: string;
  lastCheckupAt: string | null;
  vaccinatedAt: string | null;
};

type Campaign = {
  id: string;
  name: string;
  type: string;
  status: string;
  participation: number;
  targetCount: number;
};

type Cert = { id: string; employeeName: string; type: string; issuedAt: string };
type Sick = { id: string; employeeName: string; reason: string | null; status: string; startDate: string };

type Report = {
  employeeCount: number;
  vaccinationRate: number;
  checkupParticipation: number;
  avgCampaignParticipation: number;
  openSickLeave: number;
  certificatesIssued: number;
  insuranceSupport: string | null;
};

export default function CorporateDashboardPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [certs, setCerts] = useState<Cert[]>([]);
  const [sickLeaves, setSickLeaves] = useState<Sick[]>([]);
  const [report, setReport] = useState<Report | null>(null);
  const [profileName, setProfileName] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function load() {
    const res = await fetch("/api/corporate");
    const d = await res.json();
    if (d.error) {
      setError(d.error);
      return;
    }
    setEmployees(d.employees || []);
    setCampaigns(d.campaigns || []);
    setCerts(d.certificates || []);
    setSickLeaves(d.sickLeaves || []);
    setReport(d.report);
    setProfileName(d.profile?.name || "");
  }

  useEffect(() => {
    load();
  }, []);

  async function post(body: Record<string, unknown>) {
    const res = await fetch("/api/corporate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const d = await res.json();
    setMessage(res.ok ? d.message || "Saved" : d.error);
    if (res.ok) load();
    return res.ok;
  }

  async function addEmployee(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    await post({
      action: "add_employee",
      name: fd.get("name"),
      email: fd.get("email"),
      department: fd.get("department"),
    });
    e.currentTarget.reset();
  }

  return (
    <PageShell
      eyebrow="Corporate Healthcare"
      title="Employee health programs"
      description="Manage employees, checkups, campaigns, vaccinations, certificates, sick leave, insurance, and reports."
    >
      {error && <p className="error-text">{error}</p>}
      {message && <p className="muted">{message}</p>}

      {report && (
        <div className="feature-grid" style={{ marginBottom: "1.25rem" }}>
          <div className="panel">
            <p className="badge">Employees</p>
            <h3>{report.employeeCount}</h3>
            <p className="muted">{profileName}</p>
          </div>
          <div className="panel">
            <p className="badge">Vaccination</p>
            <h3>{report.vaccinationRate}%</h3>
          </div>
          <div className="panel">
            <p className="badge">Checkups</p>
            <h3>{report.checkupParticipation}%</h3>
          </div>
          <div className="panel">
            <p className="badge">Campaign avg</p>
            <h3>{report.avgCampaignParticipation}%</h3>
          </div>
        </div>
      )}

      <div className="feature-grid">
        <form className="panel" onSubmit={addEmployee}>
          <h2 style={{ marginTop: 0 }}>Add employee</h2>
          <label className="label">Name</label>
          <input className="input" name="name" required />
          <label className="label">Email</label>
          <input className="input" name="email" type="email" required />
          <label className="label">Department</label>
          <input className="input" name="department" />
          <button className="btn btn-primary" type="submit" style={{ marginTop: "0.5rem" }}>
            Add
          </button>
        </form>

        <form
          className="panel"
          onSubmit={async (e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            await post({
              action: "create_campaign",
              name: fd.get("name"),
              type: fd.get("type"),
              targetCount: Number(fd.get("target")),
              status: "active",
            });
            e.currentTarget.reset();
          }}
        >
          <h2 style={{ marginTop: 0 }}>Health campaign</h2>
          <label className="label">Name</label>
          <input className="input" name="name" required />
          <label className="label">Type</label>
          <select className="input" name="type" defaultValue="vaccination">
            <option value="vaccination">Vaccination</option>
            <option value="checkup">Checkup</option>
            <option value="health">Wellness</option>
          </select>
          <label className="label">Target count</label>
          <input className="input" name="target" type="number" defaultValue={100} />
          <button className="btn btn-primary" type="submit" style={{ marginTop: "0.5rem" }}>
            Create campaign
          </button>
        </form>

        <form
          className="panel"
          onSubmit={async (e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            await post({
              action: "issue_certificate",
              employeeName: fd.get("employeeName"),
              type: fd.get("type"),
              notes: fd.get("notes"),
            });
            e.currentTarget.reset();
          }}
        >
          <h2 style={{ marginTop: 0 }}>Medical certificate</h2>
          <label className="label">Employee</label>
          <input className="input" name="employeeName" required />
          <label className="label">Type</label>
          <input className="input" name="type" defaultValue="fitness" />
          <label className="label">Notes</label>
          <input className="input" name="notes" />
          <button className="btn btn-primary" type="submit" style={{ marginTop: "0.5rem" }}>
            Issue
          </button>
        </form>

        <form
          className="panel"
          onSubmit={async (e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            await post({
              action: "sick_leave",
              employeeName: fd.get("employeeName"),
              reason: fd.get("reason"),
              startDate: fd.get("startDate"),
            });
            e.currentTarget.reset();
          }}
        >
          <h2 style={{ marginTop: 0 }}>Sick leave</h2>
          <label className="label">Employee</label>
          <input className="input" name="employeeName" required />
          <label className="label">Start</label>
          <input className="input" name="startDate" type="date" required />
          <label className="label">Reason</label>
          <input className="input" name="reason" />
          <button className="btn btn-primary" type="submit" style={{ marginTop: "0.5rem" }}>
            Record
          </button>
        </form>
      </div>

      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", margin: "1.25rem 0" }}>
        <button className="btn btn-primary" type="button" onClick={() => post({ action: "schedule_checkup" })}>
          Schedule checkups (all)
        </button>
        <button className="btn" type="button" onClick={() => post({ action: "generate_report" })}>
          Generate report
        </button>
        <button
          className="btn"
          type="button"
          onClick={() =>
            post({
              action: "campaign_notify",
              message: "Please complete your scheduled health checkup via MedCare.",
            })
          }
        >
          Notify employees
        </button>
      </div>

      {report?.insuranceSupport && (
        <div className="panel" style={{ marginBottom: "1rem" }}>
          <h3 style={{ marginTop: 0 }}>Insurance integration</h3>
          <p>{report.insuranceSupport}</p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              await post({ action: "update_insurance", insuranceSupport: fd.get("insurance") });
            }}
          >
            <input className="input" name="insurance" defaultValue={report.insuranceSupport || ""} />
            <button className="btn" type="submit" style={{ marginTop: "0.5rem" }}>
              Update insurance notes
            </button>
          </form>
        </div>
      )}

      <div className="panel" style={{ marginBottom: "1rem" }}>
        <h2 style={{ marginTop: 0 }}>Employees</h2>
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Dept</th>
              <th>Checkup</th>
              <th>Vaccine</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {employees.map((e) => (
              <tr key={e.id}>
                <td>
                  {e.name}
                  <br />
                  <span className="muted">{e.email}</span>
                </td>
                <td>{e.department || "—"}</td>
                <td>{e.lastCheckupAt ? new Date(e.lastCheckupAt).toLocaleDateString() : "—"}</td>
                <td>{e.vaccinatedAt ? new Date(e.vaccinatedAt).toLocaleDateString() : "—"}</td>
                <td>
                  <button
                    className="btn btn-ghost"
                    type="button"
                    onClick={() => post({ action: "record_vaccination", employeeId: e.id })}
                  >
                    Mark vaccinated
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {employees.length === 0 && <p className="muted">No employees yet — add above or re-seed.</p>}
      </div>

      <div className="panel" style={{ marginBottom: "1rem" }}>
        <h2 style={{ marginTop: 0 }}>Campaigns</h2>
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Participation</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {campaigns.map((c) => (
              <tr key={c.id}>
                <td>{c.name}</td>
                <td>
                  {c.participation}/{c.targetCount || "—"}
                </td>
                <td>
                  <span className="badge">{c.status}</span>
                </td>
                <td>
                  <button
                    className="btn btn-ghost"
                    type="button"
                    onClick={() =>
                      post({
                        action: "vaccination_reminder",
                        campaignId: c.id,
                        message: `Reminder for campaign: ${c.name}`,
                      })
                    }
                  >
                    Send reminder
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="two-col-grid">
        <div className="panel">
          <h2 style={{ marginTop: 0 }}>Certificates</h2>
          {certs.map((c) => (
            <p key={c.id} className="muted">
              {c.employeeName} — {c.type} ({new Date(c.issuedAt).toLocaleDateString()})
            </p>
          ))}
          {certs.length === 0 && <p className="muted">None yet.</p>}
        </div>
        <div className="panel">
          <h2 style={{ marginTop: 0 }}>Sick leave</h2>
          {sickLeaves.map((s) => (
            <div key={s.id} style={{ marginBottom: "0.5rem" }}>
              <p>
                {s.employeeName} — {s.reason || "n/a"} <span className="badge">{s.status}</span>
              </p>
              {s.status === "open" && (
                <button
                  className="btn btn-ghost"
                  type="button"
                  onClick={() => post({ action: "close_sick_leave", id: s.id })}
                >
                  Close
                </button>
              )}
            </div>
          ))}
          {sickLeaves.length === 0 && <p className="muted">None yet.</p>}
        </div>
      </div>
    </PageShell>
  );
}
