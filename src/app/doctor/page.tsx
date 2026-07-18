"use client";

import { useEffect, useState } from "react";
import { RoleHomeShell } from "@/components/role-home-shell";
import { ProfileForm } from "@/components/profile-form";
import { HistoryPanel } from "@/components/history-panel";
import { doctorProfileFields, personalProfileFields } from "@/lib/profile-fields";

export default function DoctorHomePage() {
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
  const profile = (user?.doctorProfile as Record<string, unknown>) || {};
  const waiting = (data?.histories?.waitingPatients || []) as Record<string, unknown>[];
  const prescriptions = (data?.histories?.prescriptions || []) as Record<string, unknown>[];

  return (
    <RoleHomeShell role="DOCTOR" title="Doctor dashboard">
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
            action="update_doctor"
            fields={doctorProfileFields}
            initialValues={profile}
            onSaved={load}
          />

          {Boolean(profile.verified) && (
            <div className="panel">
              <span className="badge">Verified physician</span>
            </div>
          )}

          <div className="panel">
            <h2 className="section-title" style={{ marginTop: 0 }}>
              Current schedule
            </h2>
            <pre style={{ whiteSpace: "pre-wrap", margin: 0 }}>{String(profile.schedule || "Not set")}</pre>
          </div>

          <HistoryPanel
            title={`Waiting patients (${waiting.length})`}
            rows={waiting}
            emptyMessage="No upcoming booked appointments."
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
              { key: "type", label: "Type" },
              { key: "notes", label: "Notes" },
            ]}
          />

          <HistoryPanel
            title="Issued prescriptions"
            rows={prescriptions}
            columns={[
              { key: "medication", label: "Medication" },
              { key: "dosage", label: "Dosage" },
              {
                key: "patient",
                label: "Patient",
                render: (r) => {
                  const p = r.patient as { name?: string } | undefined;
                  return p?.name || "—";
                },
              },
              { key: "status", label: "Status", render: (r) => <span className="badge">{String(r.status)}</span> },
              {
                key: "issuedAt",
                label: "Issued",
                render: (r) => new Date(String(r.issuedAt)).toLocaleDateString(),
              },
            ]}
          />
        </div>
      )}
    </RoleHomeShell>
  );
}
