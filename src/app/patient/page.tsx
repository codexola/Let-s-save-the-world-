"use client";

import { useEffect, useState } from "react";
import { RoleHomeShell } from "@/components/role-home-shell";
import { ProfileForm } from "@/components/profile-form";
import { HistoryPanel } from "@/components/history-panel";
import {
  patientFavoritesFields,
  patientMedicalFields,
  patientPaymentFields,
  personalProfileFields,
} from "@/lib/profile-fields";

type ProfileData = {
  user: {
    name: string;
    email: string;
    phone?: string | null;
    photoUrl?: string | null;
    bio?: string | null;
    gender?: string | null;
    dateOfBirth?: string | null;
    patientProfile?: Record<string, unknown> | null;
  };
  histories: {
    appointments?: Array<Record<string, unknown>>;
    prescriptions?: Array<Record<string, unknown>>;
    reviews?: Array<Record<string, unknown>>;
    subscriptions?: Array<Record<string, unknown>>;
    aiConsultations?: Array<Record<string, unknown>>;
    chatThreads?: Array<Record<string, unknown>>;
    chatThreadsCount?: number;
  };
};

export default function PatientHomePage() {
  const [data, setData] = useState<ProfileData | null>(null);
  const [error, setError] = useState("");

  async function load() {
    const res = await fetch("/api/profile");
    const json = await res.json();
    if (!res.ok) {
      setError(json.error || "Failed to load");
      return;
    }
    setData(json);
  }

  useEffect(() => {
    load();
  }, []);

  const user = data?.user;
  const profile = user?.patientProfile || {};
  const h = data?.histories || {};

  return (
    <RoleHomeShell role="PATIENT" title="Patient dashboard">
      {error && <p className="error-text">{error}</p>}

      {user && (
        <div style={{ marginTop: "1.25rem", display: "grid", gap: "1.25rem" }}>
          <ProfileForm
            title="Personal profile"
            action="update_profile"
            fields={personalProfileFields}
            initialValues={{
              name: user.name,
              email: user.email,
              phone: user.phone,
              photoUrl: user.photoUrl,
              bio: user.bio,
              gender: user.gender,
              dateOfBirth: user.dateOfBirth
                ? String(user.dateOfBirth).slice(0, 10)
                : "",
            }}
            onSaved={load}
          />

          <ProfileForm
            title="Medical profile"
            action="update_patient"
            fields={patientMedicalFields}
            initialValues={profile}
            onSaved={load}
          />

          <ProfileForm
            title="Favorites"
            action="update_patient"
            fields={patientFavoritesFields}
            initialValues={profile}
            extraPayload={{
              bloodType: profile.bloodType,
              allergies: profile.allergies,
              medications: profile.medications,
              medicalHistory: profile.medicalHistory,
              insuranceInfo: profile.insuranceInfo,
              incomeBracket: profile.incomeBracket,
              preferredLanguage: profile.preferredLanguage,
              familyDoctor: profile.familyDoctor,
              emergencyContact: profile.emergencyContact,
              paymentMethods: profile.paymentMethods,
            }}
            onSaved={load}
          />

          <ProfileForm
            title="Payment methods"
            action="update_patient"
            fields={patientPaymentFields}
            initialValues={profile}
            extraPayload={{
              bloodType: profile.bloodType,
              allergies: profile.allergies,
              medications: profile.medications,
              medicalHistory: profile.medicalHistory,
              insuranceInfo: profile.insuranceInfo,
              familyDoctor: profile.familyDoctor,
              emergencyContact: profile.emergencyContact,
              favoriteHospitals: profile.favoriteHospitals,
              favoriteDoctors: profile.favoriteDoctors,
            }}
            onSaved={load}
          />

          <HistoryPanel
            title="Appointment history"
            rows={(h.appointments || []) as Record<string, unknown>[]}
            columns={[
              {
                key: "scheduledAt",
                label: "When",
                render: (r) => new Date(String(r.scheduledAt)).toLocaleString(),
              },
              {
                key: "doctor",
                label: "Doctor",
                render: (r) => {
                  const d = r.doctor as { name?: string } | undefined;
                  return d?.name || "—";
                },
              },
              { key: "type", label: "Type" },
              { key: "status", label: "Status", render: (r) => <span className="badge">{String(r.status)}</span> },
            ]}
          />

          <HistoryPanel
            title="Prescription history"
            rows={(h.prescriptions || []) as Record<string, unknown>[]}
            columns={[
              { key: "medication", label: "Medication" },
              { key: "dosage", label: "Dosage" },
              {
                key: "doctor",
                label: "Doctor",
                render: (r) => {
                  const d = r.doctor as { name?: string } | undefined;
                  return d?.name || "—";
                },
              },
              { key: "status", label: "Status", render: (r) => <span className="badge">{String(r.status)}</span> },
              {
                key: "issuedAt",
                label: "Issued",
                render: (r) => new Date(String(r.issuedAt)).toLocaleDateString(),
              },
            ]}
          />

          <HistoryPanel
            title={`Chat history (${h.chatThreadsCount ?? 0} threads)`}
            rows={(h.chatThreads || []) as Record<string, unknown>[]}
            columns={[
              {
                key: "partner",
                label: "Partner",
                render: (r) => {
                  const a = r.participantA as { name?: string } | undefined;
                  const b = r.participantB as { name?: string } | undefined;
                  return `${a?.name || "?"} ↔ ${b?.name || "?"}`;
                },
              },
              {
                key: "updatedAt",
                label: "Last activity",
                render: (r) => new Date(String(r.updatedAt)).toLocaleString(),
              },
            ]}
          />

          <HistoryPanel
            title="Reviews given"
            rows={(h.reviews || []) as Record<string, unknown>[]}
            columns={[
              { key: "rating", label: "Rating" },
              { key: "comment", label: "Comment" },
              { key: "targetType", label: "Target type" },
              {
                key: "createdAt",
                label: "Date",
                render: (r) => new Date(String(r.createdAt)).toLocaleDateString(),
              },
            ]}
          />

          <HistoryPanel
            title="Subscription status"
            rows={(h.subscriptions || []) as Record<string, unknown>[]}
            columns={[
              { key: "plan", label: "Plan" },
              { key: "status", label: "Status", render: (r) => <span className="badge">{String(r.status)}</span> },
              { key: "priceYen", label: "Price (¥)" },
              {
                key: "paid",
                label: "Paid",
                render: (r) => (r.paid ? "Yes" : "No"),
              },
            ]}
          />

          <HistoryPanel
            title="AI consultation history"
            rows={(h.aiConsultations || []) as Record<string, unknown>[]}
            columns={[
              { key: "symptoms", label: "Symptoms" },
              { key: "riskLevel", label: "Risk", render: (r) => <span className="badge">{String(r.riskLevel)}</span> },
              { key: "specialty", label: "Specialty" },
              {
                key: "createdAt",
                label: "Date",
                render: (r) => new Date(String(r.createdAt)).toLocaleString(),
              },
            ]}
          />
        </div>
      )}
    </RoleHomeShell>
  );
}
