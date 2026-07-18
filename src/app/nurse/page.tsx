"use client";

import { useEffect, useState } from "react";
import { RoleHomeShell } from "@/components/role-home-shell";
import { ProfileForm } from "@/components/profile-form";
import { HistoryPanel } from "@/components/history-panel";
import { nurseProfileFields, personalProfileFields } from "@/lib/profile-fields";

export default function NurseHomePage() {
  const [data, setData] = useState<{
    user: Record<string, unknown>;
    histories: Record<string, unknown>;
  } | null>(null);

  async function load() {
    const [profileRes, dashRes] = await Promise.all([
      fetch("/api/profile"),
      fetch("/api/me/dashboard"),
    ]);
    const profile = await profileRes.json();
    const dash = await dashRes.json();
    setData({
      user: profile.user,
      histories: { ...profile.histories, ...dash },
    });
  }

  useEffect(() => {
    load();
  }, []);

  const user = data?.user as Record<string, unknown> | undefined;
  const profile = (user?.nurseProfile as Record<string, unknown>) || {};
  const appointments = (data?.histories?.appointments || []) as Record<string, unknown>[];

  return (
    <RoleHomeShell role="NURSE" title="Nurse dashboard">
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
            title="Professional profile"
            action="update_nurse"
            fields={nurseProfileFields}
            initialValues={profile}
            onSaved={load}
          />

          {Boolean(profile.verified) && (
            <div className="panel">
              <span className="badge">Verified nurse</span>
            </div>
          )}

          <div className="panel">
            <h2 className="section-title" style={{ marginTop: 0 }}>
              Shift schedule
            </h2>
            <pre style={{ whiteSpace: "pre-wrap", margin: 0 }}>{String(profile.schedule || "Not set")}</pre>
          </div>

          <HistoryPanel
            title={`Assigned / waiting patients (${appointments.length})`}
            rows={appointments}
            emptyMessage="No upcoming appointments at your affiliated hospital."
            columns={[
              {
                key: "scheduledAt",
                label: "Scheduled",
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
              { key: "type", label: "Type" },
            ]}
          />
        </div>
      )}
    </RoleHomeShell>
  );
}
