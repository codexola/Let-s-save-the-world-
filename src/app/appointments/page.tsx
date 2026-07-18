"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { PageShell } from "@/components/page-shell";

type Doctor = {
  id: string;
  specialty: string | null;
  consultationFee: number | null;
  onlineAvailable?: boolean;
  offlineAvailable?: boolean;
  user: { id: string; name: string; photoUrl?: string | null };
};

type Appointment = {
  id: string;
  type: string;
  status: string;
  scheduledAt: string;
  queuePosition?: number | null;
  estimatedWaitMinutes?: number | null;
  recurrenceRule?: string | null;
  doctor: { name: string; id?: string } | null;
  patient: { name: string } | null;
};

export default function AppointmentsPage() {
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [queue, setQueue] = useState<Appointment[]>([]);
  const [doctorId, setDoctorId] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [type, setType] = useState("VIDEO");
  const [waitlist, setWaitlist] = useState(false);
  const [recurrenceRule, setRecurrenceRule] = useState("NONE");
  const [recurrenceCount, setRecurrenceCount] = useState(1);
  const [rescheduleId, setRescheduleId] = useState<string | null>(null);
  const [rescheduleAt, setRescheduleAt] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function load() {
    const [dRes, aRes, qRes] = await Promise.all([
      fetch(`/api/appointments?doctors=1&type=${type}`),
      fetch("/api/appointments"),
      fetch(`/api/appointments?queue=1${doctorId ? `&doctorId=${doctorId}` : ""}`),
    ]);
    if (dRes.ok) setDoctors((await dRes.json()).doctors || []);
    if (aRes.ok) setAppointments((await aRes.json()).appointments || []);
    if (qRes.ok) setQueue((await qRes.json()).queue || []);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type]);

  async function book(e: FormEvent) {
    e.preventDefault();
    setError("");
    const res = await fetch("/api/appointments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "book",
        doctorId,
        scheduledAt,
        type,
        waitlist,
        recurrenceRule,
        recurrenceCount,
        recordingConsent: type === "VIDEO",
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error);
      return;
    }
    setMessage(
      `Booked${data.seriesCount > 1 ? ` (${data.seriesCount} visits)` : ""}. Queue #${data.queue?.queuePosition}, ETA ~${data.queue?.estimatedWaitMinutes} min.${data.telemedicine ? " Video room created." : ""}`
    );
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

  async function submitReschedule(e: FormEvent) {
    e.preventDefault();
    if (!rescheduleId) return;
    await fetch("/api/appointments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "reschedule", id: rescheduleId, scheduledAt: rescheduleAt }),
    });
    setRescheduleId(null);
    load();
  }

  async function joinWaitlist(id: string) {
    await fetch("/api/appointments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "join_waitlist", id }),
    });
    load();
  }

  const actionable = (status: string) =>
    status === "BOOKED" || status === "RESCHEDULED" || status === "WAITING_LIST";

  return (
    <PageShell
      eyebrow="Appointments"
      title="Book, waitlist, recurring & queue"
      description="Video, in-person, and home visits with cancel, reschedule, waiting list, queue ETA, and recurring series."
    >
      <form className="panel" onSubmit={book}>
        <label className="label">Type</label>
        <select className="input" value={type} onChange={(e) => setType(e.target.value)}>
          <option value="VIDEO">Video consultation</option>
          <option value="IN_PERSON">In-person consultation</option>
          <option value="HOME_VISIT">Home visit</option>
        </select>
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
        <label className="label">Recurring</label>
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <select className="input" value={recurrenceRule} onChange={(e) => setRecurrenceRule(e.target.value)}>
            <option value="NONE">One-time</option>
            <option value="WEEKLY">Weekly</option>
            <option value="BIWEEKLY">Biweekly</option>
            <option value="MONTHLY">Monthly</option>
            <option value="DAILY">Daily</option>
          </select>
          {recurrenceRule !== "NONE" && (
            <input
              className="input"
              type="number"
              min={1}
              max={12}
              value={recurrenceCount}
              onChange={(e) => setRecurrenceCount(Number(e.target.value))}
              style={{ maxWidth: 100 }}
              title="Number of visits"
            />
          )}
        </div>
        <label style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginTop: "0.75rem" }}>
          <input type="checkbox" checked={waitlist} onChange={(e) => setWaitlist(e.target.checked)} />
          Join waiting list instead of confirmed slot
        </label>
        {error && <p className="error-text">{error}</p>}
        {message && <p className="muted">{message}</p>}
        <button className="btn btn-primary form-submit" type="submit">
          Book
        </button>
        {type === "VIDEO" && (
          <p className="muted" style={{ fontSize: "0.85rem" }}>
            Video bookings auto-create a telemedicine room.{" "}
            <Link href="/telemedicine">Open video consultation</Link>
          </p>
        )}
      </form>

      {rescheduleId && (
        <form className="panel" style={{ marginTop: "1rem" }} onSubmit={submitReschedule}>
          <h2 style={{ marginTop: 0 }}>Reschedule</h2>
          <input
            className="input"
            type="datetime-local"
            value={rescheduleAt}
            onChange={(e) => setRescheduleAt(e.target.value)}
            required
          />
          <button className="btn btn-primary form-submit" type="submit">
            Save new time
          </button>
          <button className="btn btn-ghost" type="button" onClick={() => setRescheduleId(null)}>
            Cancel
          </button>
        </form>
      )}

      <div className="panel" style={{ marginTop: "1.25rem" }}>
        <h2 style={{ marginTop: 0 }}>Queue estimation</h2>
        {queue.length === 0 && <p className="muted">No active queue for selected doctor.</p>}
        {queue.slice(0, 8).map((q) => (
          <div key={q.id} style={{ marginBottom: "0.35rem" }}>
            <span className="badge">#{q.queuePosition ?? "—"}</span> {q.patient?.name || "Patient"} ·{" "}
            {q.status} · ETA ~{q.estimatedWaitMinutes ?? "—"} min ·{" "}
            {new Date(q.scheduledAt).toLocaleString()}
          </div>
        ))}
      </div>

      <div className="panel" style={{ marginTop: "1.25rem" }}>
        <h2 style={{ marginTop: 0 }}>Your appointments</h2>
        <table className="table">
          <thead>
            <tr>
              <th>When</th>
              <th>Type</th>
              <th>Status</th>
              <th>Queue</th>
              <th>Provider</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {appointments.map((a) => (
              <tr key={a.id}>
                <td>{new Date(a.scheduledAt).toLocaleString()}</td>
                <td>
                  {a.type}
                  {a.recurrenceRule ? ` · ${a.recurrenceRule}` : ""}
                </td>
                <td>
                  <span className="badge">{a.status}</span>
                </td>
                <td>
                  #{a.queuePosition ?? "—"} / ~{a.estimatedWaitMinutes ?? "—"}m
                </td>
                <td>{a.doctor?.name || a.patient?.name}</td>
                <td style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap" }}>
                  {actionable(a.status) && (
                    <>
                      <button className="btn btn-ghost" type="button" onClick={() => cancel(a.id)}>
                        Cancel
                      </button>
                      <button
                        className="btn btn-ghost"
                        type="button"
                        onClick={() => {
                          setRescheduleId(a.id);
                          setRescheduleAt(a.scheduledAt.slice(0, 16));
                        }}
                      >
                        Reschedule
                      </button>
                    </>
                  )}
                  {a.status === "BOOKED" && (
                    <button className="btn btn-ghost" type="button" onClick={() => joinWaitlist(a.id)}>
                      Waiting list
                    </button>
                  )}
                  {a.type === "VIDEO" && actionable(a.status) && (
                    <Link href="/telemedicine" className="btn btn-ghost">
                      Video
                    </Link>
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
