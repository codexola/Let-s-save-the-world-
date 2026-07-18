"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { PageShell } from "@/components/page-shell";

type Member = {
  id: string;
  name: string;
  relationship: string;
  emergencyContact: string | null;
  medications: string | null;
  vaccinationNotes: string | null;
  medicalNotes: string | null;
  allergies: string | null;
  phone: string | null;
  appointments?: Array<{ id: string; title: string; scheduledAt: string; location: string | null }>;
  medicationLogs?: Array<{ id: string; medication: string; schedule: string | null }>;
};

type Appt = {
  id: string;
  title: string;
  scheduledAt: string;
  location: string | null;
  familyMember: { name: string };
};

export default function FamilyPage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [appointments, setAppointments] = useState<Appt[]>([]);
  const [medications, setMedications] = useState<Array<{ id: string; medication: string; familyMember: { name: string } }>>([]);
  const [emergencyContacts, setEmergencyContacts] = useState<Array<{ member: string; relationship: string; contact: string | null }>>([]);
  const [relationships, setRelationships] = useState<string[]>([]);
  const [byRelationship, setByRelationship] = useState<Record<string, Member[]>>({});
  const [name, setName] = useState("");
  const [relationship, setRelationship] = useState("child");
  const [memberId, setMemberId] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function load() {
    const res = await fetch("/api/family");
    const d = await res.json();
    if (!res.ok) {
      setError(d.error || "Sign in required");
      return;
    }
    setMembers(d.members || []);
    setAppointments(d.appointments || []);
    setMedications(d.medications || []);
    setEmergencyContacts(d.emergencyContacts || []);
    setRelationships(d.relationships || []);
    setByRelationship(d.byRelationship || {});
    if (d.members?.[0]?.id) setMemberId(d.members[0].id);
    if (d.relationships?.[0]) setRelationship(d.relationships[0]);
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <PageShell
      eyebrow="Family"
      title="Family health management"
      description="One account manages parents, children, grandparents, spouse, and dependents — appointments, medications, records, vaccinations, emergency contacts, dashboard."
    >
      {error && <p className="error-text">{error}</p>}
      {message && <p className="muted">{message}</p>}
      <p className="muted">
        Also see <Link href="/vaccination">Vaccinations</Link> and <Link href="/ehr">EHR</Link>.
      </p>

      <div className="feature-grid" style={{ marginBottom: "1rem" }}>
        {relationships.map((r) => (
          <div key={r} className="panel">
            <p className="badge">{r}</p>
            <p style={{ fontSize: "1.5rem", margin: 0 }}>{(byRelationship[r] || []).length}</p>
          </div>
        ))}
      </div>

      <form
        className="panel form-narrow"
        style={{ marginBottom: "1rem" }}
        onSubmit={async (e: FormEvent) => {
          e.preventDefault();
          const res = await fetch("/api/family", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "add_member",
              name,
              relationship,
              emergencyContact: "Primary caregiver on file",
            }),
          });
          const d = await res.json();
          if (!res.ok) setError(d.error);
          else {
            setMessage(`Added ${d.member.name}`);
            setName("");
            load();
          }
        }}
      >
        <h3 style={{ marginTop: 0 }}>Add family member</h3>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" required />
        <select className="input" value={relationship} onChange={(e) => setRelationship(e.target.value)}>
          {relationships.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <button className="btn btn-primary form-submit" type="submit">
          Add
        </button>
      </form>

      <div className="panel" style={{ marginBottom: "1rem" }}>
        <h3 style={{ marginTop: 0 }}>Family health dashboard</h3>
        {members.map((m) => (
          <div key={m.id} style={{ marginBottom: "0.75rem", paddingBottom: "0.75rem", borderBottom: "1px solid #e2e8f0" }}>
            <strong>
              {m.name} <span className="badge">{m.relationship}</span>
            </strong>
            <p className="muted">Emergency: {m.emergencyContact || "—"}</p>
            <p className="muted">Medications: {m.medications || "—"}</p>
            <p className="muted">Medical records notes: {m.medicalNotes || "—"}</p>
            <p className="muted">Vaccination records: {m.vaccinationNotes || "—"}</p>
            <p className="muted">Allergies: {m.allergies || "—"}</p>
          </div>
        ))}
      </div>

      <form
        className="panel form-narrow"
        style={{ marginBottom: "1rem" }}
        onSubmit={async (e: FormEvent<HTMLFormElement>) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          const res = await fetch("/api/family", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "book_appointment",
              familyMemberId: memberId,
              title: String(fd.get("title")),
              scheduledAt: String(fd.get("scheduledAt")),
              location: String(fd.get("location") || "Clinic"),
            }),
          });
          const d = await res.json();
          if (!res.ok) setError(d.error);
          else {
            setMessage("Appointment booked");
            load();
          }
        }}
      >
        <h3 style={{ marginTop: 0 }}>Appointment booking</h3>
        <label className="label">Family member</label>
        <select className="input" value={memberId} onChange={(e) => setMemberId(e.target.value)}>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name} ({m.relationship})
            </option>
          ))}
        </select>
        <label className="label">Title</label>
        <input className="input" name="title" required defaultValue="Family checkup" />
        <label className="label">When</label>
        <input
          className="input"
          name="scheduledAt"
          type="datetime-local"
          required
          defaultValue={new Date(Date.now() + 86400_000).toISOString().slice(0, 16)}
        />
        <label className="label">Location</label>
        <input className="input" name="location" defaultValue="Tokyo Central Hospital" />
        <button className="btn btn-primary form-submit" type="submit">
          Book
        </button>
      </form>

      <form
        className="panel form-narrow"
        style={{ marginBottom: "1rem" }}
        onSubmit={async (e: FormEvent<HTMLFormElement>) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          const res = await fetch("/api/family", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "add_medication",
              familyMemberId: memberId,
              medication: String(fd.get("medication")),
              dosage: String(fd.get("dosage") || ""),
              schedule: String(fd.get("schedule") || "daily"),
            }),
          });
          const d = await res.json();
          if (!res.ok) setError(d.error);
          else {
            setMessage("Medication added");
            load();
          }
        }}
      >
        <h3 style={{ marginTop: 0 }}>Medication management</h3>
        <input className="input" name="medication" required placeholder="Medication name" />
        <input className="input" name="dosage" placeholder="Dosage" />
        <input className="input" name="schedule" placeholder="Schedule" defaultValue="daily" />
        <button className="btn btn-primary form-submit" type="submit">
          Add medication
        </button>
      </form>

      <div className="panel" style={{ marginBottom: "1rem" }}>
        <h3 style={{ marginTop: 0 }}>Upcoming family appointments</h3>
        {appointments.map((a) => (
          <p key={a.id}>
            {a.familyMember.name}: {a.title} — {new Date(a.scheduledAt).toLocaleString()} @ {a.location}
          </p>
        ))}
        {appointments.length === 0 && <p className="muted">None scheduled.</p>}
      </div>

      <div className="panel" style={{ marginBottom: "1rem" }}>
        <h3 style={{ marginTop: 0 }}>Family medications</h3>
        {medications.map((m) => (
          <p key={m.id}>
            {m.familyMember.name}: {m.medication}
          </p>
        ))}
      </div>

      <div className="panel">
        <h3 style={{ marginTop: 0 }}>Emergency contacts</h3>
        {emergencyContacts.map((e, i) => (
          <p key={i}>
            {e.member} ({e.relationship}): {e.contact}
          </p>
        ))}
      </div>
    </PageShell>
  );
}
