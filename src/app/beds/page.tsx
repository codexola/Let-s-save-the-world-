"use client";

import { useEffect, useState } from "react";
import { PageShell } from "@/components/page-shell";

export default function BedsPage() {
  const [data, setData] = useState<{
    hospital: { name: string; totalBeds: number; icuBeds: number; emergencyBeds: number; isolationRooms: number; operatingRooms: number };
    realtime: Record<string, number>;
    equipment: Record<string, { total: number; available: number } | string>;
    forecast: { points: Array<{ hourOffset: number; predictedOccupancyPercent: number; predictedAvailableBeds: number }>; peakPercent: number; note: string };
  } | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function load() {
    const res = await fetch("/api/beds");
    const d = await res.json();
    if (!res.ok) {
      setError(d.error || "Sign in required");
      return;
    }
    setData(d);
  }

  useEffect(() => {
    load();
  }, []);

  const rt = data?.realtime;

  return (
    <PageShell
      eyebrow="Operations"
      title="Hospital bed management"
      description="Real-time available · ICU · emergency · isolation · operating rooms · equipment availability · AI occupancy forecast."
    >
      {error && <p className="error-text">{error}</p>}
      {message && <p className="muted">{message}</p>}

      <div style={{ display: "flex", gap: "0.4rem", marginBottom: "1rem" }}>
        <button className="btn btn-primary" type="button" onClick={load}>
          Refresh real-time census
        </button>
        <button
          className="btn"
          type="button"
          onClick={async () => {
            const res = await fetch("/api/beds", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action: "refresh" }),
            });
            const d = await res.json();
            if (!res.ok) setError(d.error);
            else {
              setData(d);
              setMessage("Census refreshed");
            }
          }}
        >
          Force snapshot
        </button>
      </div>

      {data && (
        <>
          <h2 style={{ marginTop: 0 }}>{data.hospital.name}</h2>
          <div className="feature-grid" style={{ marginBottom: "1rem" }}>
            <div className="panel">
              <p className="badge">Available beds</p>
              <p style={{ fontSize: "1.8rem", margin: 0 }}>{rt?.availableBeds}</p>
              <p className="muted">Occupied {rt?.occupiedBeds} / total {data.hospital.totalBeds}</p>
            </div>
            <div className="panel">
              <p className="badge">ICU beds</p>
              <p style={{ fontSize: "1.8rem", margin: 0 }}>{rt?.icuAvailable} free</p>
              <p className="muted">Occupied {rt?.icuOccupied} / {data.hospital.icuBeds}</p>
            </div>
            <div className="panel">
              <p className="badge">Emergency beds</p>
              <p style={{ fontSize: "1.8rem", margin: 0 }}>{rt?.emergencyAvailable} free</p>
              <p className="muted">Occupied {rt?.emergencyOccupied} / {data.hospital.emergencyBeds}</p>
            </div>
            <div className="panel">
              <p className="badge">Isolation rooms</p>
              <p style={{ fontSize: "1.8rem", margin: 0 }}>{rt?.isolationAvailable} free</p>
              <p className="muted">Occupied {rt?.isolationOccupied} / {data.hospital.isolationRooms}</p>
            </div>
            <div className="panel">
              <p className="badge">Operating rooms</p>
              <p style={{ fontSize: "1.8rem", margin: 0 }}>{rt?.orAvailable} free</p>
              <p className="muted">In use {rt?.orOccupied} / {data.hospital.operatingRooms}</p>
            </div>
            <div className="panel">
              <p className="badge">Occupancy</p>
              <p style={{ fontSize: "1.8rem", margin: 0 }}>{rt?.occupancyPercent}%</p>
            </div>
          </div>

          <h3>Equipment availability</h3>
          <div className="feature-grid" style={{ marginBottom: "1rem" }}>
            {Object.entries(data.equipment).map(([k, v]) =>
              typeof v === "string" ? (
                <div key={k} className="panel">
                  <p className="badge">Listed</p>
                  <p>{v}</p>
                </div>
              ) : (
                <div key={k} className="panel">
                  <p className="badge">{k}</p>
                  <p>
                    {v.available} / {v.total} available
                  </p>
                </div>
              )
            )}
          </div>

          <h3>AI occupancy forecast (24h)</h3>
          <p className="muted">{data.forecast.note}</p>
          <p>Peak predicted occupancy: {data.forecast.peakPercent}%</p>
          <div className="feature-grid">
            {data.forecast.points.map((p) => (
              <div key={p.hourOffset} className="panel">
                <p className="badge">+{p.hourOffset}h</p>
                <p>{p.predictedOccupancyPercent}% · ~{p.predictedAvailableBeds} beds free</p>
              </div>
            ))}
          </div>
        </>
      )}
    </PageShell>
  );
}
