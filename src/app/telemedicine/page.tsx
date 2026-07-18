"use client";

import { FormEvent, useEffect, useState } from "react";
import { PageShell } from "@/components/page-shell";

type Session = {
  id: string;
  roomUrl: string;
  provider: string;
  status: string;
  recordingConsent: boolean;
  createdAt: string;
};

export default function TelemedicinePage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [hostId, setHostId] = useState("");
  const [consent, setConsent] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function load() {
    const res = await fetch("/api/telemedicine");
    if (res.ok) {
      const data = await res.json();
      setSessions(data.sessions || []);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function startSession(e: FormEvent) {
    e.preventDefault();
    setError("");
    setMessage("");
    const res = await fetch("/api/telemedicine", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "create", hostId, recordingConsent: consent }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Failed — sign in required");
      return;
    }
    setMessage(`Session created (${data.session.provider}). Join link ready.`);
    load();
  }

  return (
    <PageShell
      eyebrow="Telemedicine"
      title="Video consultation"
      description="Start or join a secure video visit with consent."
    >
      <form className="panel" onSubmit={startSession}>
        <label className="label">Doctor user ID</label>
        <input
          className="input"
          value={hostId}
          onChange={(e) => setHostId(e.target.value)}
          placeholder="Paste doctor user ID from profile"
          required
        />
        <label style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginTop: "0.75rem" }}>
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
          I consent to telemedicine session (recording policy acknowledged)
        </label>
        {error && <p className="error-text">{error}</p>}
        {message && <p className="muted">{message}</p>}
        <button className="btn btn-primary form-submit" type="submit" disabled={!consent}>
          Start session
        </button>
      </form>

      <div className="panel" style={{ marginTop: "1.25rem" }}>
        <h2 style={{ marginTop: 0 }}>Your sessions</h2>
        {sessions.length === 0 && <p className="muted">No sessions yet.</p>}
        <table className="table">
          <thead>
            <tr>
              <th>Status</th>
              <th>Provider</th>
              <th>Room</th>
            </tr>
          </thead>
          <tbody>
            {sessions.map((s) => (
              <tr key={s.id}>
                <td><span className="badge">{s.status}</span></td>
                <td>{s.provider}</td>
                <td>
                  <a href={s.roomUrl} target="_blank" rel="noreferrer" className="btn btn-ghost">
                    Join video
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </PageShell>
  );
}
