"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { PageShell } from "@/components/page-shell";

type ProviderRec = {
  id: string;
  name: string;
  specialty?: string | null;
  distanceKm?: number | null;
  reason: string;
};

type Enrichment = {
  diseasePredictions?: Array<{ name: string; probability: number; icdHint?: string }>;
  medications?: Array<{ name: string; type: string; note: string }>;
  lifestyleAdvice?: string;
  nutritionAdvice?: string;
  mentalHealthAdvice?: string;
  recommendedHospitals?: ProviderRec[];
  recommendedDoctors?: ProviderRec[];
  recommendedNurses?: ProviderRec[];
  nearbyProviders?: ProviderRec[];
  appointmentSuggestion?: {
    type: string;
    specialty: string;
    urgency: string;
    preferredWithinHours: number;
    note: string;
  };
  followUpAt?: string;
  reminderId?: string;
};

type Consultation = {
  id: string;
  symptoms: string;
  analysis: string;
  riskLevel: string;
  specialty: string | null;
  recommendations: string | null;
  emergency: boolean;
  diseasePredictions?: string | null;
  lifestyleAdvice?: string | null;
  nutritionAdvice?: string | null;
  mentalHealthAdvice?: string | null;
  createdAt: string;
  followUpAt?: string | null;
};

type Reminder = {
  id: string;
  title: string;
  body: string;
  dueAt: string;
  completed: boolean;
};

function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function ProviderList({ title, items }: { title: string; items: ProviderRec[] }) {
  if (!items.length) return null;
  return (
    <div style={{ marginTop: "1rem" }}>
      <h3 style={{ marginBottom: "0.5rem" }}>{title}</h3>
      <ul style={{ margin: 0, paddingLeft: "1.1rem" }}>
        {items.map((p) => (
          <li key={`${title}-${p.id}`}>
            <Link href={`/profile/${p.id}`}>{p.name}</Link>
            {p.specialty ? ` · ${p.specialty}` : ""}
            {p.distanceKm != null ? ` · ${p.distanceKm} km` : ""}
            <div className="muted" style={{ fontSize: "0.85rem" }}>
              {p.reason}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function AiConsultantPage() {
  const [symptoms, setSymptoms] = useState("");
  const [result, setResult] = useState<Consultation | null>(null);
  const [enrichment, setEnrichment] = useState<Enrichment | null>(null);
  const [provider, setProvider] = useState("");
  const [history, setHistory] = useState<Consultation[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [coords, setCoords] = useState<{ latitude?: number; longitude?: number }>({});

  useEffect(() => {
    fetch("/api/ai/consult")
      .then((r) => r.json())
      .then((d) => {
        if (!d.error) setHistory(d.history || []);
      });
    fetch("/api/ai/consult?reminders=1")
      .then((r) => r.json())
      .then((d) => {
        if (!d.error) setReminders(d.reminders || []);
      });
    if (typeof navigator !== "undefined" && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) =>
          setCoords({
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
          }),
        () =>
          setCoords({
            latitude: 35.6812,
            longitude: 139.7671,
          })
      );
    } else {
      setCoords({ latitude: 35.6812, longitude: 139.7671 });
    }
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const res = await fetch("/api/ai/consult", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        symptoms,
        latitude: coords.latitude,
        longitude: coords.longitude,
      }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error || "Failed");
      return;
    }
    setResult(data.consultation);
    setEnrichment(data.enrichment || null);
    setProvider(data.provider || "");
    setHistory((h) => [data.consultation, ...h]);
    if (data.enrichment?.reminderId) {
      const remRes = await fetch("/api/ai/consult?reminders=1").then((r) => r.json());
      setReminders(remRes.reminders || []);
    }
  }

  async function completeReminder(id: string) {
    await fetch("/api/ai/consult", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "complete_reminder", reminderId: id }),
    });
    setReminders((r) => r.map((x) => (x.id === id ? { ...x, completed: true } : x)));
  }

  const diseases =
    enrichment?.diseasePredictions ||
    parseJson(result?.diseasePredictions, [] as Enrichment["diseasePredictions"]);
  const meds = enrichment?.medications || [];
  const hospitals = enrichment?.recommendedHospitals || [];
  const doctors = enrichment?.recommendedDoctors || [];
  const nurses = enrichment?.recommendedNurses || [];
  const nearby = enrichment?.nearbyProviders || [];
  const appt = enrichment?.appointmentSuggestion;

  return (
    <PageShell
      eyebrow="AI Consultant"
      title="AI Medical Consultant"
      description="Symptom analysis, disease likelihoods, provider matching, lifestyle, nutrition, mental health, and follow-ups."
    >
      <div className="panel" style={{ marginBottom: "1rem", borderColor: "var(--accent)" }}>
        <p className="muted" style={{ margin: 0 }}>
          <strong>Disclaimer:</strong> This AI triage does not replace professional medical judgment.
          Call 119 for emergencies. Predictions are illustrative probabilities, not diagnoses.
        </p>
      </div>

      <form className="panel form-narrow" onSubmit={onSubmit}>
        <label className="label">Describe your symptoms</label>
        <textarea
          className="input"
          rows={4}
          value={symptoms}
          onChange={(e) => setSymptoms(e.target.value)}
          required
          placeholder="e.g. fever and sore throat for 2 days"
        />
        <p className="muted" style={{ fontSize: "0.85rem" }}>
          Location for nearby providers:{" "}
          {coords.latitude != null
            ? `${coords.latitude.toFixed(4)}, ${coords.longitude?.toFixed(4)}`
            : "detecting…"}
        </p>
        {error && <p className="error-text">{error}</p>}
        <button className="btn btn-primary form-submit" type="submit" disabled={loading}>
          {loading ? "Analyzing…" : "Get full consultation"}
        </button>
      </form>

      {result && (
        <div className="panel" style={{ marginTop: "1.25rem" }}>
          <p className="badge">{result.emergency ? "EMERGENCY" : result.riskLevel}</p>
          {result.specialty && (
            <p>
              <strong>Recommended specialty:</strong> {result.specialty}
            </p>
          )}
          {provider && <p className="muted">Provider: {provider}</p>}
          <pre style={{ whiteSpace: "pre-wrap", fontFamily: "inherit" }}>{result.analysis}</pre>
          {result.recommendations && (
            <p>
              <strong>Recommendations:</strong> {result.recommendations}
            </p>
          )}

          {diseases && diseases.length > 0 && (
            <div style={{ marginTop: "1rem" }}>
              <h3>Disease prediction (illustrative)</h3>
              <ul>
                {diseases.map((d) => (
                  <li key={d.name}>
                    {d.name} — {Math.round(d.probability * 100)}%
                    {d.icdHint ? ` (ICD hint ${d.icdHint})` : ""}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {meds.length > 0 && (
            <div style={{ marginTop: "1rem" }}>
              <h3>Medication recommendations</h3>
              <ul>
                {meds.map((m) => (
                  <li key={m.name}>
                    <strong>{m.name}</strong> [{m.type}] — {m.note}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {(enrichment?.lifestyleAdvice || result.lifestyleAdvice) && (
            <p style={{ marginTop: "1rem" }}>
              <strong>Lifestyle:</strong> {enrichment?.lifestyleAdvice || result.lifestyleAdvice}
            </p>
          )}
          {(enrichment?.nutritionAdvice || result.nutritionAdvice) && (
            <p>
              <strong>Nutrition:</strong> {enrichment?.nutritionAdvice || result.nutritionAdvice}
            </p>
          )}
          {(enrichment?.mentalHealthAdvice || result.mentalHealthAdvice) && (
            <p>
              <strong>Mental health:</strong>{" "}
              {enrichment?.mentalHealthAdvice || result.mentalHealthAdvice}
            </p>
          )}

          {appt && (
            <div style={{ marginTop: "1rem" }}>
              <h3>Appointment recommendation</h3>
              <p>
                {appt.type} · {appt.specialty} · urgency {appt.urgency} · within{" "}
                {appt.preferredWithinHours}h
              </p>
              <p className="muted">{appt.note}</p>
              {!result.emergency && (
                <Link className="btn btn-primary" href="/appointments">
                  Book appointment
                </Link>
              )}
              {result.emergency && (
                <p className="error-text">Emergency flagged — EMS request logged. Call 119 now.</p>
              )}
            </div>
          )}

          <ProviderList title="Recommended hospitals" items={hospitals} />
          <ProviderList title="Recommended doctors" items={doctors} />
          <ProviderList title="Recommended nurses" items={nurses} />
          <ProviderList title="Nearby providers" items={nearby} />

          {(enrichment?.followUpAt || result.followUpAt) && (
            <p style={{ marginTop: "1rem" }}>
              <strong>Follow-up reminder:</strong>{" "}
              {new Date(enrichment?.followUpAt || result.followUpAt || "").toLocaleString()}
            </p>
          )}
        </div>
      )}

      {reminders.length > 0 && (
        <div className="panel" style={{ marginTop: "1.25rem" }}>
          <h2 style={{ marginTop: 0 }}>Follow-up reminders</h2>
          {reminders.map((r) => (
            <div key={r.id} style={{ marginBottom: "0.75rem" }}>
              <span className="badge">{r.completed ? "done" : "due"}</span> {r.title}
              <div className="muted">{new Date(r.dueAt).toLocaleString()}</div>
              <div>{r.body}</div>
              {!r.completed && (
                <button className="btn btn-ghost" type="button" onClick={() => completeReminder(r.id)}>
                  Mark complete
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {history.length > 0 && (
        <div className="panel" style={{ marginTop: "1.25rem" }}>
          <h2 style={{ marginTop: 0 }}>History</h2>
          {history.slice(0, 8).map((h) => (
            <div key={h.id} style={{ marginBottom: "0.75rem" }}>
              <span className="badge">{h.riskLevel}</span>{" "}
              {h.specialty ? `${h.specialty} · ` : ""}
              {h.symptoms.slice(0, 80)}
            </div>
          ))}
        </div>
      )}
    </PageShell>
  );
}
