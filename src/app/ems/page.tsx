"use client";

import { FormEvent, useEffect, useState } from "react";
import { PageShell } from "@/components/page-shell";

type EmsRequest = {
  id: string;
  symptoms: string;
  status: string;
  etaMinutes: number | null;
  aiAssessment: string | null;
  riskLevel: string | null;
  destinationName: string | null;
  emergencyIdCode: string | null;
  hospitalNotified: boolean;
  familyNotified: boolean;
  ambulanceLat: number | null;
  ambulanceLng: number | null;
  latitude: number | null;
  longitude: number | null;
  vitalsJson: string | null;
  treatmentNotes: string | null;
  arrivalPredictedAt: string | null;
  ambulance?: { callSign: string; status: string } | null;
  patient?: { name: string } | null;
  sharedHistoryJson?: string | null;
};

type DigitalId = {
  publicCode: string;
  bloodType: string | null;
  allergies: string | null;
  medications: string | null;
  medicalHistory: string | null;
  emergencyContacts: string | null;
  insuranceInfo: string | null;
  shareToken: string;
};

export default function EmsPage() {
  const [tab, setTab] = useState<"call" | "track" | "ambulance" | "id">("call");
  const [symptoms, setSymptoms] = useState("");
  const [location, setLocation] = useState("");
  const [coords, setCoords] = useState<{ lat?: number; lng?: number }>({});
  const [active, setActive] = useState<EmsRequest | null>(null);
  const [requests, setRequests] = useState<EmsRequest[]>([]);
  const [digitalId, setDigitalId] = useState<DigitalId | null>(null);
  const [beds, setBeds] = useState<Array<{ name: string; totalBeds: number; icuBeds: number }>>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [vitals, setVitals] = useState({ hr: "88", spo2: "97", bp: "128/82", rr: "18" });
  const [notes, setNotes] = useState("");

  async function loadRequests() {
    const res = await fetch("/api/ems");
    if (res.ok) {
      const d = await res.json();
      setRequests(d.requests || []);
    }
  }

  useEffect(() => {
    loadRequests();
    fetch("/api/ems?action=my_digital_id")
      .then((r) => r.json())
      .then((d) => {
        if (d.digitalId) setDigitalId(d.digitalId);
      });
    fetch("/api/ems?action=beds")
      .then((r) => r.json())
      .then((d) => setBeds(d.hospitals || []));
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => setCoords({ lat: 35.6812, lng: 139.7671 })
      );
    } else {
      setCoords({ lat: 35.6812, lng: 139.7671 });
    }
  }, []);

  async function oneTouch(e?: FormEvent) {
    e?.preventDefault();
    setError("");
    const res = await fetch("/api/ems", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "one_touch",
        symptoms: symptoms || "One-touch emergency — please respond",
        location: location || (coords.lat ? `${coords.lat.toFixed(5)}, ${coords.lng?.toFixed(5)}` : "Unknown"),
        latitude: coords.lat,
        longitude: coords.lng,
        runAi: true,
      }),
    });
    const d = await res.json();
    if (!res.ok) {
      setError(d.error);
      return;
    }
    setActive(d.request);
    setMessage(d.message);
    setTab("track");
    loadRequests();
  }

  async function refreshGps(id: string) {
    const res = await fetch(`/api/ems?action=track&id=${id}`);
    const d = await res.json();
    if (d.request) setActive(d.request);
    loadRequests();
  }

  return (
    <PageShell
      eyebrow="Emergency Medical Services"
      title="EMS call center"
      description="One-touch emergency · AI symptom assessment · ambulance dispatch · live GPS · family & hospital notify · digital emergency ID."
    >
      {error && <p className="error-text">{error}</p>}
      {message && <p className="muted">{message}</p>}

      <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", marginBottom: "1rem" }}>
        {(
          [
            ["call", "Emergency call"],
            ["track", "Live tracking"],
            ["ambulance", "Ambulance dashboard"],
            ["id", "Digital emergency ID"],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            className={tab === k ? "btn btn-primary" : "btn btn-ghost"}
            type="button"
            onClick={() => setTab(k)}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "call" && (
        <form className="panel form-narrow" onSubmit={oneTouch}>
          <h2 style={{ marginTop: 0 }}>One-touch emergency request</h2>
          <p className="muted">
            GPS: {coords.lat?.toFixed(4)}, {coords.lng?.toFixed(4)} — AI assessment is triage only and does not replace a
            physician.
          </p>
          <label className="label">Symptoms</label>
          <textarea
            className="input"
            rows={3}
            value={symptoms}
            onChange={(e) => setSymptoms(e.target.value)}
            placeholder="e.g. severe chest pain, shortness of breath"
          />
          <label className="label">Location description</label>
          <input className="input" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Address or landmark" />
          <button className="btn btn-primary form-submit" type="submit" style={{ background: "#b91c1c" }}>
            Request ambulance now
          </button>
        </form>
      )}

      {tab === "track" && (
        <div className="panel">
          <h2 style={{ marginTop: 0 }}>Live GPS tracking</h2>
          {!active && requests[0] && (
            <button className="btn" type="button" onClick={() => setActive(requests[0])}>
              Open latest request
            </button>
          )}
          {active && (
            <>
              <p>
                <span className="badge">{active.status}</span> ETA ~{active.etaMinutes ?? "—"} min · Destination:{" "}
                {active.destinationName}
              </p>
              <p className="muted">
                Ambulance {active.ambulance?.callSign} @ {active.ambulanceLat?.toFixed(5)}, {active.ambulanceLng?.toFixed(5)}
              </p>
              <p className="muted">
                Patient GPS: {active.latitude?.toFixed(5)}, {active.longitude?.toFixed(5)}
              </p>
              {active.aiAssessment && (
                <div style={{ marginTop: "0.75rem" }}>
                  <p className="badge">AI assessment · {active.riskLevel}</p>
                  <p>{active.aiAssessment}</p>
                </div>
              )}
              <p className="muted">
                Hospital pre-notified: {active.hospitalNotified ? "yes" : "no"} · Family notified:{" "}
                {active.familyNotified ? "yes" : "no"} · Digital ID: {active.emergencyIdCode || "—"}
              </p>
              {active.sharedHistoryJson && (
                <pre style={{ whiteSpace: "pre-wrap", fontSize: "0.8rem" }}>
                  {JSON.stringify(JSON.parse(active.sharedHistoryJson), null, 2)}
                </pre>
              )}
              <button className="btn btn-primary" type="button" onClick={() => refreshGps(active.id)}>
                Refresh GPS / ETA
              </button>
            </>
          )}
          {!active && <p className="muted">No active request — use Emergency call.</p>}
        </div>
      )}

      {tab === "ambulance" && (
        <div>
          <div className="panel" style={{ marginBottom: "1rem" }}>
            <h2 style={{ marginTop: 0 }}>Ambulance dashboard</h2>
            <p className="muted">Current patients, destination, GPS, vitals, notes, arrival prediction, bed sync.</p>
            <button
              className="btn"
              type="button"
              onClick={async () => {
                const res = await fetch("/api/ems", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ action: "sync_beds" }),
                });
                const d = await res.json();
                setBeds(d.hospitals || []);
                setMessage(`Beds synced at ${d.syncedAt}`);
              }}
            >
              Sync bed availability
            </button>
            <div className="feature-grid" style={{ marginTop: "0.75rem" }}>
              {beds.map((h) => (
                <div key={h.name} className="panel">
                  <strong>{h.name}</strong>
                  <p className="muted">
                    Beds {h.totalBeds} · ICU {h.icuBeds}
                  </p>
                </div>
              ))}
            </div>
          </div>
          {requests.map((r) => (
            <div key={r.id} className="panel" style={{ marginBottom: "0.75rem" }}>
              <h3 style={{ marginTop: 0 }}>
                {r.patient?.name || "Patient"} — {r.ambulance?.callSign || "AMB"}
              </h3>
              <p>
                <span className="badge">{r.status}</span> → {r.destinationName} · ETA {r.etaMinutes}m · arrival{" "}
                {r.arrivalPredictedAt ? new Date(r.arrivalPredictedAt).toLocaleTimeString() : "—"}
              </p>
              <p className="muted">{r.symptoms}</p>
              <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                <input
                  className="input"
                  style={{ width: 70 }}
                  value={vitals.hr}
                  onChange={(e) => setVitals({ ...vitals, hr: e.target.value })}
                  placeholder="HR"
                />
                <input
                  className="input"
                  style={{ width: 70 }}
                  value={vitals.spo2}
                  onChange={(e) => setVitals({ ...vitals, spo2: e.target.value })}
                  placeholder="SpO2"
                />
                <input
                  className="input"
                  style={{ width: 90 }}
                  value={vitals.bp}
                  onChange={(e) => setVitals({ ...vitals, bp: e.target.value })}
                  placeholder="BP"
                />
                <input
                  className="input"
                  style={{ flex: 1, minWidth: 140 }}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Emergency treatment notes"
                />
                <button
                  className="btn btn-primary"
                  type="button"
                  onClick={async () => {
                    await fetch("/api/ems", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        action: "update_vitals",
                        id: r.id,
                        vitals,
                        treatmentNotes: notes,
                        status: "en_route",
                      }),
                    });
                    setMessage("Vitals / notes saved");
                    loadRequests();
                  }}
                >
                  Save vitals
                </button>
                <button className="btn" type="button" onClick={() => refreshGps(r.id)}>
                  GPS tick
                </button>
                <button
                  className="btn"
                  type="button"
                  onClick={async () => {
                    await fetch("/api/ems", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ action: "arrive_hospital", id: r.id }),
                    });
                    loadRequests();
                  }}
                >
                  Mark arrived
                </button>
              </div>
              {r.vitalsJson && (
                <p className="muted" style={{ fontSize: "0.85rem", marginTop: "0.5rem" }}>
                  Vitals: {r.vitalsJson} {r.treatmentNotes ? `· Notes: ${r.treatmentNotes}` : ""}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {tab === "id" && (
        <div className="panel">
          <h2 style={{ marginTop: 0 }}>Digital emergency ID</h2>
          <p className="muted">Blood type · allergies · medications · emergency contacts · insurance — shareable with responders.</p>
          <button
            className="btn btn-primary"
            type="button"
            onClick={async () => {
              const res = await fetch("/api/ems", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "ensure_digital_id" }),
              });
              const d = await res.json();
              if (d.digitalId) setDigitalId(d.digitalId);
            }}
          >
            Create / refresh ID
          </button>
          {digitalId && (
            <div style={{ marginTop: "1rem" }}>
              <p className="font-display" style={{ fontSize: "1.6rem" }}>
                {digitalId.publicCode}
              </p>
              <p>Blood type: {digitalId.bloodType || "—"}</p>
              <p>Allergies: {digitalId.allergies || "—"}</p>
              <p>Medications: {digitalId.medications || "—"}</p>
              <p>History: {digitalId.medicalHistory || "—"}</p>
              <p>Emergency contacts: {digitalId.emergencyContacts || "—"}</p>
              <p>Insurance: {digitalId.insuranceInfo || "—"}</p>
              <p className="muted" style={{ fontSize: "0.8rem" }}>
                Responder lookup: /api/ems?action=digital_id&code={digitalId.publicCode}
              </p>
            </div>
          )}
        </div>
      )}
    </PageShell>
  );
}
