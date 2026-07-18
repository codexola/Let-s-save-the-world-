"use client";

import { useEffect, useState } from "react";
import { RoleHomeShell } from "@/components/role-home-shell";
import { ProfileForm } from "@/components/profile-form";
import { HistoryPanel } from "@/components/history-panel";
import { hospitalProfileFields, personalProfileFields } from "@/lib/profile-fields";

type DashboardData = {
  profile: Record<string, unknown> | null;
  counts: {
    linkedDoctors: number;
    linkedNurses: number;
    icuBeds: number;
    totalBeds: number;
    operatingRooms: number;
    occupancyPct: number;
    appointments: number;
  };
  appointments: Record<string, unknown>[];
};

export default function HospitalHomePage() {
  const [user, setUser] = useState<Record<string, unknown> | null>(null);
  const [dash, setDash] = useState<DashboardData | null>(null);

  async function load() {
    const [profileRes, dashRes] = await Promise.all([
      fetch("/api/profile"),
      fetch("/api/me/dashboard"),
    ]);
    const profile = await profileRes.json();
    const dashboard = await dashRes.json();
    setUser(profile.user);
    setDash(dashboard);
  }

  useEffect(() => {
    load();
  }, []);

  const profile = (user?.hospitalProfile as Record<string, unknown>) || dash?.profile || {};
  const counts = dash?.counts;

  return (
    <RoleHomeShell role="HOSPITAL" title="Hospital dashboard">
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

          {counts && (
            <div className="feature-grid">
              <div className="panel">
                <p className="badge">Total beds</p>
                <h3>{counts.totalBeds}</h3>
              </div>
              <div className="panel">
                <p className="badge">ICU beds</p>
                <h3>{counts.icuBeds}</h3>
              </div>
              <div className="panel">
                <p className="badge">Operating rooms</p>
                <h3>{counts.operatingRooms}</h3>
              </div>
              <div className="panel">
                <p className="badge">Occupancy</p>
                <h3>{counts.occupancyPct}%</h3>
              </div>
              <div className="panel">
                <p className="badge">Linked doctors (DB)</p>
                <h3>{counts.linkedDoctors}</h3>
              </div>
              <div className="panel">
                <p className="badge">Linked nurses (DB)</p>
                <h3>{counts.linkedNurses}</h3>
              </div>
            </div>
          )}

          <ProfileForm
            title="Hospital profile"
            action="update_hospital"
            fields={hospitalProfileFields}
            initialValues={profile}
            onSaved={load}
          />

          <HistoryPanel
            title="Recent appointments"
            rows={(dash?.appointments || []) as Record<string, unknown>[]}
            columns={[
              {
                key: "scheduledAt",
                label: "When",
                render: (r) => new Date(String(r.scheduledAt)).toLocaleString(),
              },
              {
                key: "patient",
                label: "Patient",
                render: (r) => {
                  const p = r.patient as { name?: string } | undefined;
                  return p?.name || "—";
                },
              },
              {
                key: "doctor",
                label: "Doctor",
                render: (r) => {
                  const d = r.doctor as { name?: string } | undefined;
                  return d?.name || "—";
                },
              },
              { key: "status", label: "Status", render: (r) => <span className="badge">{String(r.status)}</span> },
            ]}
          />
        </div>
      )}
    </RoleHomeShell>
  );
}
