"use client";

import { FormEvent, useEffect, useState } from "react";
import { PageShell } from "@/components/page-shell";

type PlatformStats = Record<string, number>;

function Spark({ points }: { points: Array<{ at: string; value: number }> }) {
  if (!points.length) return <p className="muted">No data yet</p>;
  const vals = points.map((p) => p.value);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const w = 220;
  const h = 48;
  const path = points
    .map((p, i) => {
      const x = (i / Math.max(1, points.length - 1)) * w;
      const y = h - ((p.value - min) / Math.max(0.001, max - min)) * (h - 4) - 2;
      return `${i === 0 ? "M" : "L"}${x},${y}`;
    })
    .join(" ");
  return (
    <svg width={w} height={h} style={{ display: "block" }}>
      <path d={path} fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

export default function AnalyticsPage() {
  const [scope, setScope] = useState("auto");
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [metricType, setMetricType] = useState("weight");
  const [metricValue, setMetricValue] = useState("");

  async function load(s = scope) {
    setError("");
    const res = await fetch(`/api/analytics?scope=${s}`);
    const d = await res.json();
    if (!res.ok) {
      setError(d.error);
      return;
    }
    setData(d);
  }

  useEffect(() => {
    load();
  }, []);

  async function logMetric(e: FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/analytics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "log_metric",
        type: metricType,
        value: Number(metricValue),
        unit:
          metricType === "weight"
            ? "kg"
            : metricType.startsWith("bp")
              ? "mmHg"
              : metricType === "blood_sugar"
                ? "mg/dL"
                : metricType === "sleep_hours"
                  ? "h"
                  : metricType === "exercise_minutes"
                    ? "min"
                    : "%",
      }),
    });
    const d = await res.json();
    setMessage(res.ok ? "Metric logged" : d.error);
    if (res.ok) load("patient");
  }

  const stats = (data?.stats || null) as PlatformStats | null;
  const patient = data?.patient as {
    appointments: Record<string, number>;
    expensesYen: number;
    healthTrends: Record<string, Array<{ at: string; value: number }> | number | null>;
  } | undefined;
  const hospital = data?.hospital as {
    revenueYen: number;
    appointments: Record<string, number>;
    ratings: { average: number | null; count: number };
    doctors: { count: number; load: Array<{ name: string; appointments: number }> };
    occupancy: Record<string, number>;
  } | undefined;
  const corporate = data?.corporate as {
    participation: number;
    healthStatistics: Record<string, number>;
    campaigns: Array<{ name: string; status: string; participation: number; targetCount: number }>;
    reports: string | null;
  } | null | undefined;

  return (
    <PageShell
      eyebrow="Analytics"
      title="Health & operations analytics"
      description="Patient trends · hospital revenue & occupancy · corporate participation · platform KPIs."
    >
      {error && <p className="error-text">{error}</p>}
      {message && <p className="muted">{message}</p>}

      <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", marginBottom: "1rem" }}>
        {[
          ["auto", "My dashboard"],
          ["patient", "Patient"],
          ["hospital", "Hospital"],
          ["corporate", "Corporate"],
          ["platform", "Platform"],
        ].map(([k, label]) => (
          <button
            key={k}
            className={scope === k ? "btn btn-primary" : "btn btn-ghost"}
            type="button"
            onClick={() => {
              setScope(k);
              load(k);
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {stats && (
        <div className="feature-grid" style={{ marginBottom: "1.25rem" }}>
          {Object.entries(stats).map(([label, value]) => (
            <div key={label} className="panel">
              <p className="badge">{label}</p>
              <h3>{typeof value === "number" ? value.toLocaleString() : String(value)}</h3>
            </div>
          ))}
        </div>
      )}

      {patient && (
        <>
          <div className="feature-grid" style={{ marginBottom: "1rem" }}>
            <div className="panel">
              <p className="badge">Appointments</p>
              <h3>{patient.appointments.total}</h3>
              <p className="muted">
                {patient.appointments.booked} booked · {patient.appointments.completed} completed
              </p>
            </div>
            <div className="panel">
              <p className="badge">Expenses</p>
              <h3>¥{patient.expensesYen.toLocaleString()}</h3>
            </div>
            <div className="panel">
              <p className="badge">Med adherence avg</p>
              <h3>
                {patient.healthTrends.medicationAdherenceAvg != null
                  ? `${patient.healthTrends.medicationAdherenceAvg}%`
                  : "—"}
              </h3>
            </div>
          </div>

          <form className="panel" onSubmit={logMetric} style={{ marginBottom: "1rem" }}>
            <h2 style={{ marginTop: 0 }}>Log health metric</h2>
            <select className="input" value={metricType} onChange={(e) => setMetricType(e.target.value)}>
              <option value="weight">Weight</option>
              <option value="bp_systolic">Blood pressure (systolic)</option>
              <option value="bp_diastolic">Blood pressure (diastolic)</option>
              <option value="blood_sugar">Blood sugar</option>
              <option value="exercise_minutes">Exercise (minutes)</option>
              <option value="sleep_hours">Sleep (hours)</option>
              <option value="medication_adherence">Medication adherence %</option>
            </select>
            <input
              className="input"
              type="number"
              step="any"
              required
              value={metricValue}
              onChange={(e) => setMetricValue(e.target.value)}
              placeholder="Value"
              style={{ marginTop: "0.5rem" }}
            />
            <button className="btn btn-primary" type="submit" style={{ marginTop: "0.5rem" }}>
              Save
            </button>
          </form>

          <div className="feature-grid">
            {(
              [
                ["weight", "Weight"],
                ["bloodPressureSystolic", "BP systolic"],
                ["bloodPressureDiastolic", "BP diastolic"],
                ["bloodSugar", "Blood sugar"],
                ["exercise", "Exercise"],
                ["sleep", "Sleep"],
                ["medicationAdherence", "Med adherence"],
              ] as const
            ).map(([key, label]) => {
              const pts = patient.healthTrends[key];
              if (!Array.isArray(pts)) return null;
              return (
                <div key={key} className="panel">
                  <p className="badge">{label}</p>
                  <Spark points={pts} />
                  <p className="muted">{pts.length} points</p>
                </div>
              );
            })}
          </div>
        </>
      )}

      {hospital && (
        <div className="feature-grid">
          <div className="panel">
            <p className="badge">Revenue</p>
            <h3>¥{hospital.revenueYen.toLocaleString()}</h3>
          </div>
          <div className="panel">
            <p className="badge">Appointments</p>
            <h3>{hospital.appointments.total}</h3>
            <p className="muted">{hospital.appointments.booked} booked</p>
          </div>
          <div className="panel">
            <p className="badge">Ratings</p>
            <h3>{hospital.ratings.average ?? "—"}</h3>
            <p className="muted">{hospital.ratings.count} reviews</p>
          </div>
          <div className="panel">
            <p className="badge">Doctors</p>
            <h3>{hospital.doctors.count}</h3>
            <ul className="muted">
              {hospital.doctors.load.slice(0, 5).map((d) => (
                <li key={d.name}>
                  {d.name}: {d.appointments}
                </li>
              ))}
            </ul>
          </div>
          <div className="panel">
            <p className="badge">Occupancy</p>
            <h3>{hospital.occupancy.occupancyPct}%</h3>
            <p className="muted">
              {hospital.occupancy.occupiedEstimate}/{hospital.occupancy.totalBeds} beds · ICU{" "}
              {hospital.occupancy.icuBeds} · OR {hospital.occupancy.operatingRooms}
            </p>
          </div>
        </div>
      )}

      {corporate && (
        <>
          <div className="feature-grid">
            <div className="panel">
              <p className="badge">Participation</p>
              <h3>{corporate.participation}%</h3>
            </div>
            {Object.entries(corporate.healthStatistics).map(([k, v]) => (
              <div key={k} className="panel">
                <p className="badge">{k}</p>
                <h3>{v}</h3>
              </div>
            ))}
          </div>
          <div className="panel" style={{ marginTop: "1rem" }}>
            <h2 style={{ marginTop: 0 }}>Campaigns</h2>
            {corporate.campaigns.map((c) => (
              <p key={c.name} className="muted">
                {c.name} — {c.participation}/{c.targetCount} ({c.status})
              </p>
            ))}
            {corporate.reports && (
              <>
                <h3>Reports</h3>
                <pre style={{ whiteSpace: "pre-wrap", fontSize: "0.85rem" }}>{corporate.reports}</pre>
              </>
            )}
          </div>
        </>
      )}
    </PageShell>
  );
}
