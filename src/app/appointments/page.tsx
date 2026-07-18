"use client";

import { FormEvent, useEffect, useState } from "react";
import { PageShell } from "@/components/page-shell";

type Doctor = {
  id: string;
  specialty: string | null;
  consultationFee: number | null;
  user: { id: string; name: string; photoUrl?: string | null };
};

type Appointment = {
  id: string;
  type: string;
  status: string;
  scheduledAt: string;
  doctor: { name: string } | null;
  patient: { name: string } | null;
};

export default function AppointmentsPage() {
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [doctorId, setDoctorId] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [type, setType] = useState("VIDEO");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function load() {
    const [dRes, aRes] = await Promise.all([
      fetch("/api/appointments?doctors=1"),
      fetch("/api/appointments"),
    ]);
    if (dRes.ok) setDoctors((await dRes.json()).doctors || []);
    if (aRes.ok) setAppointments((await aRes.json()).appointments || []);
  }

  useEffect(() => {
    load();
  }, []);

  async function book(e: FormEvent) {
    e.preventDefault();
    setError("");
    const res = await fetch("/api/appointments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "book", doctorId, scheduledAt, type }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error);
      return;
    }
    setMessage("Appointment booked");
    load();
  }

  async function cancel(id: string) {
    await fetch("/api/appointments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "cancel", id }),
    });
    load();
  }

  async function reschedule(id: string) {
    const next = prompt("New date/time (ISO format):", new Date().toISOString());
    if (!next) return;
    await fetch("/api/appointments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "reschedule", id, scheduledAt: next }),
    });
    load();
  }

  return (
    <PageShell
      eyebrow="Appointments"
      title="Book & manage visits"
      description="Schedule, cancel, or reschedule appointments with verified doctors."
    >
      <form className="panel" onSubmit={book}>
        <label className="label">Doctor</label>
        <select className="input" value={doctorId} onChange={(e) => setDoctorId(e.target.value)} required>
          <option value="">Select doctor…</option>
          {doctors.map((d) => (
            <option key={d.user.id} value={d.user.id}>
              {d.user.name} — {d.specialty} (¥{d.consultationFee?.toLocaleString() ?? "—"})
            </option>
          ))}
        </select>
        <label className="label">Date & time</label>
        <input
          className="input"
          type="datetime-local"
          value={scheduledAt}
          onChange={(e) => setScheduledAt(e.target.value)}
          required
        />
        <label className="label">Type</label>
        <select className="input" value={type} onChange={(e) => setType(e.target.value)}>
          <option value="VIDEO">Video</option>
          <option value="IN_PERSON">In person</option>
          <option value="HOME_VISIT">Home visit</option>
        </select>
        {error && <p className="error-text">{error}</p>}
        {message && <p className="muted">{message}</p>}
        <button className="btn btn-primary form-submit" type="submit">Book</button>
      </form>

      <div className="panel" style={{ marginTop: "1.25rem" }}>
        <h2 style={{ marginTop: 0 }}>Your appointments</h2>
        <table className="table">
          <thead>
            <tr>
              <th>When</th>
              <th>Type</th>
              <th>Status</th>
              <th>With</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {appointments.map((a) => (
              <tr key={a.id}>
                <td>{new Date(a.scheduledAt).toLocaleString()}</td>
                <td>{a.type}</td>
                <td><span className="badge">{a.status}</span></td>
                <td>{a.doctor?.name || a.patient?.name || "—"}</td>
                <td>
                  {a.status === "BOOKED" && (
                    <>
                      <button className="btn btn-ghost" type="button" onClick={() => reschedule(a.id)}>Reschedule</button>
                      <button className="btn btn-ghost" type="button" onClick={() => cancel(a.id)}>Cancel</button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </PageShell>
  );
}
