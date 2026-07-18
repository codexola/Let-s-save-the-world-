"use client";

import { useEffect, useState } from "react";
import { RoleHomeShell } from "@/components/role-home-shell";
import { ProfileForm } from "@/components/profile-form";
import { companyProfileFields, personalProfileFields } from "@/lib/profile-fields";

export default function CompanyHomePage() {
  const [user, setUser] = useState<Record<string, unknown> | null>(null);
  const [campaignMsg, setCampaignMsg] = useState("");
  const [notifyResult, setNotifyResult] = useState("");

  async function load() {
    const res = await fetch("/api/profile");
    const json = await res.json();
    setUser(json.user);
  }

  useEffect(() => {
    load();
  }, []);

  async function sendCampaignNotification() {
    const res = await fetch("/api/corporate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "vaccination_reminder",
        message: campaignMsg || "Annual health campaign reminder from MedCorp.",
        campaignId: "health-campaign-2026",
      }),
    });
    const data = await res.json();
    setNotifyResult(res.ok ? data.message : data.error);
  }

  const profile = (user?.companyProfile as Record<string, unknown>) || {};

  return (
    <RoleHomeShell role="COMPANY" title="Company dashboard">
      {user && (
        <div style={{ marginTop: "1.25rem", display: "grid", gap: "1.25rem" }}>
          <ProfileForm
            title="Personal profile"
            action="update_profile"
            fields={personalProfileFields}
            initialValues={{
              name: user.name,
              email: user.email,
              phone: user.phone,
              photoUrl: user.photoUrl,
              bio: user.bio,
            }}
            onSaved={load}
          />

          <ProfileForm
            title="Company profile & employee management"
            action="update_company"
            fields={companyProfileFields}
            initialValues={profile}
            onSaved={load}
          />

          <div className="panel">
            <h2 className="section-title" style={{ marginTop: 0 }}>
              Corporate healthcare hub
            </h2>
            <p className="muted">
              Manage employees, schedule checkups, campaigns, vaccinations, certificates, sick leave, and reports.
            </p>
            <a className="btn btn-primary" href="/corporate" style={{ display: "inline-block", marginTop: "0.5rem" }}>
              Open corporate dashboard
            </a>
          </div>

          <div className="panel">
            <h2 className="section-title" style={{ marginTop: 0 }}>
              Health campaign notifications
            </h2>
            <label className="label">Campaign message</label>
            <textarea
              className="input"
              rows={3}
              value={campaignMsg}
              onChange={(e) => setCampaignMsg(e.target.value)}
              placeholder="Send a vaccination or health check reminder to employees."
            />
            <button className="btn btn-primary" type="button" onClick={sendCampaignNotification} style={{ marginTop: "0.75rem" }}>
              Create campaign notification
            </button>
            {notifyResult && <p className="muted" style={{ marginTop: "0.75rem" }}>{notifyResult}</p>}
          </div>

          <div className="feature-grid">
            <div className="panel">
              <p className="badge">Employees</p>
              <h3>{String(profile.employeeCount ?? 0)}</h3>
            </div>
            <div className="panel">
              <p className="badge">Verified</p>
              <h3>{profile.verified ? "Yes" : "No"}</h3>
            </div>
          </div>
        </div>
      )}
    </RoleHomeShell>
  );
}
