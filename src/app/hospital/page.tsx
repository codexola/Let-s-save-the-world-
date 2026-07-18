"use client";

import { useEffect, useState } from "react";
import { PageShell } from "@/components/page-shell";

type HospitalData = {
  profile: {
    name: string;
    departments: string | null;
    emergencyAvailable: boolean;
  } | null;
  beds: {
    total: number;
    icu: number;
    operatingRooms: number;
    occupiedEstimate: number;
    occupancyPct: number;
  };
  appointments: Array<{
    id: string;
    scheduledAt: string;
    status: string;
    patient: { name: string } | null;
    doctor: { name: string } | null;
  }>;
};

export default function HospitalDashboardPage() {
  const [data, setData] = useState<HospitalData | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/hospital")
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setError(d.error);
        else setData(d);
      });
  }, []);

  return (
    <PageShell
      eyebrow="Hospital Dashboard"
      title="Hospital operations"
      description="Live beds, ICU, OR capacity, and scheduled appointments."
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
          </div>

          {data.profile && (
            <div className="panel" style={{ marginTop: "1.25rem" }}>
              <h2 style={{ marginTop: 0 }}>{data.profile.name}</h2>
              <p className="muted">{data.profile.departments}</p>
              {data.profile.emergencyAvailable && <span className="badge">Emergency 24/7</span>}
            </div>
          )}

          <div className="panel" style={{ marginTop: "1.25rem" }}>
            <h2 style={{ marginTop: 0 }}>Appointments</h2>
            <table className="table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Patient</th>
                  <th>Doctor</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {data.appointments.map((a) => (
                  <tr key={a.id}>
                    <td>{new Date(a.scheduledAt).toLocaleString()}</td>
                    <td>{a.patient?.name || "—"}</td>
                    <td>{a.doctor?.name || "—"}</td>
                    <td><span className="badge">{a.status}</span></td>
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
