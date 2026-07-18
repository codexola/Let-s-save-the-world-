"use client";

import { FormEvent, useEffect, useState } from "react";
import { PageShell } from "@/components/page-shell";

type Doctor = { user: { id: string; name: string } };

type Session = {
  id: string;
  roomUrl: string;
  provider: string;
  status: string;
  recordingConsent: boolean;
  recordingEnabled?: boolean;
  recordingUrl?: string | null;
  screenShareEnabled?: boolean;
  quality?: string;
  notes?: string | null;
  transcription?: string | null;
  host?: { id: string; name: string };
  patient?: { id: string; name: string };
  createdAt: string;
};

export default function TelemedicinePage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [hostId, setHostId] = useState("");
  const [consent, setConsent] = useState(false);
  const [enableRecording, setEnableRecording] = useState(true);
  const [screenShare, setScreenShare] = useState(true);
  const [quality, setQuality] = useState("hd");
  const [activeId, setActiveId] = useState("");
  const [notes, setNotes] = useState("");
  const [medication, setMedication] = useState("");
  const [dosage, setDosage] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function load() {
    const res = await fetch("/api/telemedicine");
    if (res.ok) {
      const data = await res.json();
      setSessions(data.sessions || []);
      setDoctors(data.doctors || []);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function startSession(e: FormEvent) {
    e.preventDefault();
    setError("");
    const res = await fetch("/api/telemedicine", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "create",
        hostId,
        recordingConsent: consent,
        enableRecording,
        screenShareEnabled: screenShare,
        quality,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Failed");
      return;
    }
    setMessage(`HD session created (${data.session.provider}). Screen share ${data.session.screenShareEnabled ? "on" : "off"}.`);
    setActiveId(data.session.id);
    load();
  }

  async function join(sessionId: string, roomUrl: string) {
    await fetch("/api/telemedicine", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "join", sessionId }),
    });
    setActiveId(sessionId);
    window.open(roomUrl, "_blank", "noopener,noreferrer");
    load();
  }

  async function saveNotes() {
    const res = await fetch("/api/telemedicine", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "save_notes", sessionId: activeId, notes }),
    });
    const data = await res.json();
    setMessage(res.ok ? "Medical notes saved" : data.error);
    load();
  }

  async function transcribe() {
    const res = await fetch("/api/telemedicine", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "transcribe", sessionId: activeId, notes }),
    });
    const data = await res.json();
    if (res.ok) {
      setMessage("AI transcription ready");
      load();
    } else setError(data.error);
  }

  async function issueRx(e: FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/telemedicine", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "issue_prescription",
        sessionId: activeId,
        medication,
        dosage,
      }),
    });
    const data = await res.json();
    setMessage(res.ok ? "Prescription generated from visit" : data.error);
    load();
  }

  async function endSession(sessionId: string) {
    await fetch("/api/telemedicine", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "end", sessionId }),
    });
    load();
  }

  const active = sessions.find((s) => s.id === activeId);

  return (
    <PageShell
      eyebrow="Video Consultation"
      title="HD telemedicine"
      description="High-quality video, recording consent, screen sharing, medical notes, AI transcription, and in-visit prescriptions."
    >
      <form className="panel" onSubmit={startSession}>
        <label className="label">Doctor</label>
        <select className="input" value={hostId} onChange={(e) => setHostId(e.target.value)} required>
          <option value="">Select doctor…</option>
          {doctors.map((d) => (
            <option key={d.user.id} value={d.user.id}>
              {d.user.name}
            </option>
          ))}
        </select>
        <label className="label">Quality</label>
        <select className="input" value={quality} onChange={(e) => setQuality(e.target.value)}>
          <option value="hd">High quality (HD)</option>
          <option value="sd">Standard</option>
        </select>
        <label style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginTop: "0.75rem" }}>
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
          I consent to telemedicine (required)
        </label>
        <label style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <input type="checkbox" checked={enableRecording} onChange={(e) => setEnableRecording(e.target.checked)} />
          Enable session recording
        </label>
        <label style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <input type="checkbox" checked={screenShare} onChange={(e) => setScreenShare(e.target.checked)} />
          Enable screen sharing
        </label>
        {error && <p className="error-text">{error}</p>}
        {message && <p className="muted">{message}</p>}
        <button className="btn btn-primary form-submit" type="submit" disabled={!consent}>
          Start HD session
        </button>
      </form>

      <div className="panel" style={{ marginTop: "1.25rem" }}>
        <h2 style={{ marginTop: 0 }}>Your sessions</h2>
        <table className="table">
          <thead>
            <tr>
              <th>Status</th>
              <th>Provider / Quality</th>
              <th>Features</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {sessions.map((s) => (
              <tr key={s.id}>
                <td>
                  <span className="badge">{s.status}</span>
                </td>
                <td>
                  {s.provider} · {s.quality || "hd"}
                </td>
                <td className="muted" style={{ fontSize: "0.85rem" }}>
                  {s.screenShareEnabled ? "Screen share" : ""}
                  {s.recordingEnabled ? " · Recording" : ""}
                  {s.transcription ? " · Transcript" : ""}
                </td>
                <td style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap" }}>
                  <button className="btn btn-primary" type="button" onClick={() => join(s.id, s.roomUrl)}>
                    Join video
                  </button>
                  <button className="btn btn-ghost" type="button" onClick={() => setActiveId(s.id)}>
                    Manage
                  </button>
                  {s.status !== "completed" && (
                    <button className="btn btn-ghost" type="button" onClick={() => endSession(s.id)}>
                      End
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {active && (
        <div className="panel" style={{ marginTop: "1.25rem" }}>
          <h2 style={{ marginTop: 0 }}>Session workspace — {active.host?.name || "Doctor"}</h2>
          <p className="muted">
            {active.patient?.name} · Recording consent: {active.recordingConsent ? "yes" : "no"}
            {active.recordingUrl ? (
              <>
                {" · "}
                <a href={active.recordingUrl} target="_blank" rel="noreferrer">
                  Recording link
                </a>
              </>
            ) : null}
          </p>
          <label className="label">Medical notes</label>
          <textarea
            className="input"
            rows={4}
            value={notes || active.notes || ""}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Chief complaint, exam findings, plan…"
          />
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginTop: "0.5rem" }}>
            <button className="btn btn-primary" type="button" onClick={saveNotes}>
              Save notes
            </button>
            <button className="btn btn-ghost" type="button" onClick={transcribe}>
              AI transcription
            </button>
          </div>
          {active.transcription && (
            <pre style={{ whiteSpace: "pre-wrap", fontFamily: "inherit", marginTop: "1rem" }}>
              {active.transcription}
            </pre>
          )}

          <form onSubmit={issueRx} style={{ marginTop: "1.25rem" }}>
            <h3>Prescription generation</h3>
            <label className="label">Medication</label>
            <input className="input" value={medication} onChange={(e) => setMedication(e.target.value)} required />
            <label className="label">Dosage</label>
            <input className="input" value={dosage} onChange={(e) => setDosage(e.target.value)} />
            <button className="btn btn-primary form-submit" type="submit">
              Issue from this visit
            </button>
          </form>
        </div>
      )}
    </PageShell>
  );
}
