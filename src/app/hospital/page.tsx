"use client";

import { useEffect, useState } from "react";
import { PageShell } from "@/components/page-shell";
import { ProfileForm } from "@/components/profile-form";
import { HistoryPanel } from "@/components/history-panel";
import { hospitalProfileFields } from "@/lib/profile-fields";

type HospitalData = {
  profile: Record<string, unknown> | null;
  beds: {
    total: number;
    icu: number;
    operatingRooms: number;
    occupiedEstimate: number;
    occupancyPct: number;
  };
  appointments: Record<string, unknown>[];
  role?: string;
};

export default function HospitalDashboardPage() {
  const [data, setData] = useState<HospitalData | null>(null);
  const [dash, setDash] = useState<{ counts?: Record<string, number> } | null>(null);
  const [error, setError] = useState("");
  const [isHospitalRole, setIsHospitalRole] = useState(false);

  async function load() {
    const [hRes, authRes, dashRes] = await Promise.all([
      fetch("/api/hospital"),
      fetch("/api/auth"),
      fetch("/api/me/dashboard"),
    ]);
    const h = await hRes.json();
    const auth = await authRes.json();
    const d = await dashRes.json();
    if (h.error) setError(h.error);
    else setData(h);
    setDash(d);
    setIsHospitalRole(auth.user?.role === "HOSPITAL");
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <PageShell
      eyebrow="Hospital Dashboard"
      title="Hospital operations"
      description="Live beds, ICU, OR capacity, profile management, and scheduled appointments."
    >
      {error && <p className="error-text">{error}</p>}

      {data && (
        <>
          <div className="feature-grid">
            <div className="panel">
              <p className="badge">Beds</p>
              <h3>{data.beds.total}</h3>
              <p className="muted">Total capacity</p>
            </div>
            <div className="panel">
              <p className="badge">ICU</p>
              <h3>{data.beds.icu}</h3>
              <p className="muted">ICU beds</p>
            </div>
            <div className="panel">
              <p className="badge">OR</p>
              <h3>{data.beds.operatingRooms}</h3>
              <p className="muted">Operating rooms</p>
            </div>
            <div className="panel">
              <p className="badge">Occupancy</p>
              <h3>{data.beds.occupancyPct}%</h3>
              <p className="muted">Est. {data.beds.occupiedEstimate} active bookings</p>
            </div>
            {dash?.counts && (
              <>
                <div className="panel">
                  <p className="badge">Linked doctors</p>
                  <h3>{dash.counts.linkedDoctors}</h3>
                </div>
                <div className="panel">
                  <p className="badge">Linked nurses</p>
                  <h3>{dash.counts.linkedNurses}</h3>
                </div>
              </>
            )}
          </div>

          {isHospitalRole && data.profile && (
            <div style={{ marginTop: "1.25rem" }}>
              <ProfileForm
                title="Hospital profile"
                action="update_hospital"
                fields={hospitalProfileFields}
                initialValues={data.profile}
                onSaved={load}
              />
            </div>
          )}

          {data.profile && !isHospitalRole && (
            <div className="panel" style={{ marginTop: "1.25rem" }}>
              <h2 style={{ marginTop: 0 }}>{String(data.profile.name)}</h2>
              <p className="muted">{String(data.profile.departments || "")}</p>
              {Boolean(data.profile.emergencyAvailable) && <span className="badge">Emergency 24/7</span>}
            </div>
          )}

          <HistoryPanel
            title="Appointments"
            rows={data.appointments as Record<string, unknown>[]}
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
        </>
      )}
    </PageShell>
  );
}
