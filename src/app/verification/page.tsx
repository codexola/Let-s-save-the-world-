"use client";

import { FormEvent, useEffect, useState } from "react";
import { PageShell } from "@/components/page-shell";

type VerificationState = {
  user?: {
    phone?: string | null;
    phoneVerified?: boolean;
    role?: string;
    patientProfile?: Record<string, unknown> | null;
    doctorProfile?: Record<string, unknown> | null;
    hospitalProfile?: Record<string, unknown> | null;
    companyProfile?: Record<string, unknown> | null;
  };
  verifications?: Array<{
    id: string;
    type: string;
    status: string;
    notes?: string | null;
    createdAt: string;
  }>;
  pendingReviews?: Array<{
    id: string;
    type: string;
    status: string;
    user?: { name: string; email: string; role: string; id: string };
  }>;
};

export default function VerificationPage() {
  const [data, setData] = useState<VerificationState | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [demoOtp, setDemoOtp] = useState("");

  async function load() {
    const res = await fetch("/api/verification");
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

  async function post(action: string, payload: Record<string, unknown> = {}) {
    setError("");
    setMessage("");
    const res = await fetch("/api/verification", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...payload }),
    });
    const json = await res.json();
    if (!res.ok) {
      setError(json.error || "Failed");
      return json;
    }
    setMessage(json.result?.reason || "Verification successful");
    if (json.demoCode) setDemoOtp(json.demoCode);
    load();
    return json;
  }

  const role = data?.user?.role;
  const patient = data?.user?.patientProfile || {};
  const doctor = data?.user?.doctorProfile || {};
  const hospital = data?.user?.hospitalProfile || {};
  const company = data?.user?.companyProfile || {};

  return (
    <PageShell
      eyebrow="Identity"
      title="Identity verification"
      description="Government ID, face, phone, license, institutional, and tax verification."
    >
      {error && <p className="error-text">{error}</p>}
      {message && <p className="muted">{message}</p>}

      <div className="panel" style={{ marginBottom: "1rem" }}>
        <p className="muted" style={{ margin: 0 }}>
          Phone verified: {data?.user?.phoneVerified ? "Yes" : "No"}
          {data?.user?.phone ? ` (${data.user.phone})` : ""}
        </p>
      </div>

      {/* Phone — all roles */}
      <form
        className="panel"
        style={{ marginBottom: "1.25rem" }}
        onSubmit={async (e: FormEvent<HTMLFormElement>) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          await post("phone_send_otp", { phone: fd.get("phone") });
        }}
      >
        <h2 style={{ marginTop: 0 }}>Phone verification</h2>
        <label className="label">Phone</label>
        <input className="input" name="phone" defaultValue={data?.user?.phone || "+819012345678"} required />
        <button className="btn btn-primary form-submit" type="submit">
          Send OTP
        </button>
        {demoOtp && <p className="muted">Demo OTP (inbox): {demoOtp}</p>}
      </form>

      <form
        className="panel"
        style={{ marginBottom: "1.25rem" }}
        onSubmit={async (e: FormEvent<HTMLFormElement>) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          await post("phone_verify_otp", { code: fd.get("code") });
        }}
      >
        <label className="label">OTP code</label>
        <input className="input" name="code" required placeholder="6-digit code" />
        <button className="btn btn-primary form-submit" type="submit">
          Verify phone
        </button>
      </form>

      {(role === "PATIENT" || !role) && (
        <>
          <form
            className="panel"
            style={{ marginBottom: "1.25rem" }}
            onSubmit={async (e: FormEvent<HTMLFormElement>) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              await post("patient_government_id", {
                governmentId: fd.get("governmentId"),
                governmentIdType: fd.get("governmentIdType"),
                documentUrl: fd.get("documentUrl"),
              });
            }}
          >
            <h2 style={{ marginTop: 0 }}>Patient — Government ID</h2>
            <p className="muted">
              Status: {patient.governmentIdVerified ? "Verified" : "Not verified"}
            </p>
            <label className="label">ID type</label>
            <select className="input" name="governmentIdType" defaultValue="national_id">
              <option value="national_id">National ID</option>
              <option value="my_number">My Number (12 digits)</option>
              <option value="passport">Passport</option>
            </select>
            <label className="label">ID number</label>
            <input
              className="input"
              name="governmentId"
              required
              defaultValue={String(patient.governmentId || "490154203237518")}
            />
            <label className="label">Document image URL</label>
            <input
              className="input"
              name="documentUrl"
              placeholder="https://..."
              defaultValue={String(patient.governmentIdDocument || "https://example.com/id.jpg")}
            />
            <button className="btn btn-primary form-submit" type="submit">
              Verify government ID
            </button>
          </form>

          <form
            className="panel"
            style={{ marginBottom: "1.25rem" }}
            onSubmit={async (e: FormEvent<HTMLFormElement>) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              await post("patient_face", { faceImageUrl: fd.get("faceImageUrl") });
            }}
          >
            <h2 style={{ marginTop: 0 }}>Patient — Face verification</h2>
            <p className="muted">Status: {patient.faceVerified ? "Verified" : "Not verified"}</p>
            <label className="label">Selfie / face image URL</label>
            <input
              className="input"
              name="faceImageUrl"
              required
              defaultValue={String(patient.faceImageUrl || "https://example.com/selfie.jpg")}
            />
            <button className="btn btn-primary form-submit" type="submit">
              Run face verification
            </button>
          </form>
        </>
      )}

      {role === "DOCTOR" && (
        <>
          <form
            className="panel"
            style={{ marginBottom: "1.25rem" }}
            onSubmit={async (e: FormEvent<HTMLFormElement>) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              await post("doctor_license", {
                licenseNumber: fd.get("licenseNumber"),
                licenseDocumentUrl: fd.get("licenseDocumentUrl"),
              });
            }}
          >
            <h2 style={{ marginTop: 0 }}>Doctor — License verification</h2>
            <p className="muted">
              License: {doctor.licenseVerified ? "Verified" : "Pending"} · Gov DB:{" "}
              {doctor.govDbVerified ? "Verified" : "Pending"} · Hospital:{" "}
              {doctor.hospitalConfirmed ? "Confirmed" : "Pending"} · Overall:{" "}
              {doctor.verified ? "Verified" : "Unverified"}
            </p>
            <label className="label">License number</label>
            <input
              className="input"
              name="licenseNumber"
              required
              defaultValue={String(doctor.licenseNumber || "MD12345")}
            />
            <label className="label">License document URL</label>
            <input className="input" name="licenseDocumentUrl" defaultValue="https://example.com/license.pdf" />
            <button className="btn btn-primary form-submit" type="submit">
              Verify license
            </button>
          </form>

          <form
            className="panel"
            style={{ marginBottom: "1.25rem" }}
            onSubmit={async (e: FormEvent<HTMLFormElement>) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              await post("doctor_gov_db", { nationalRegNumber: fd.get("nationalRegNumber") });
            }}
          >
            <h2 style={{ marginTop: 0 }}>Doctor — Government database</h2>
            <label className="label">National registration number</label>
            <input
              className="input"
              name="nationalRegNumber"
              required
              defaultValue={String(doctor.nationalRegNumber || "NATREG001")}
            />
            <button className="btn btn-primary form-submit" type="submit">
              Check government registry
            </button>
          </form>

          <form
            className="panel"
            style={{ marginBottom: "1.25rem" }}
            onSubmit={async (e: FormEvent<HTMLFormElement>) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              await post("doctor_request_hospital_confirm", {
                hospitalAffiliation: fd.get("hospitalAffiliation"),
              });
            }}
          >
            <h2 style={{ marginTop: 0 }}>Doctor — Hospital confirmation</h2>
            <label className="label">Hospital affiliation</label>
            <input
              className="input"
              name="hospitalAffiliation"
              required
              defaultValue={String(doctor.hospitalAffiliation || "Tokyo Central Hospital")}
            />
            <button className="btn btn-primary form-submit" type="submit">
              Request / auto-confirm hospital
            </button>
          </form>
        </>
      )}

      {role === "HOSPITAL" && (
        <>
          <form
            className="panel"
            style={{ marginBottom: "1.25rem" }}
            onSubmit={async (e: FormEvent<HTMLFormElement>) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              await post("hospital_business_reg", {
                businessRegistration: fd.get("businessRegistration"),
              });
            }}
          >
            <h2 style={{ marginTop: 0 }}>Hospital — Business registration</h2>
            <p className="muted">
              Business: {hospital.businessRegVerified ? "Verified" : "Pending"} · Institution:{" "}
              {hospital.medicalInstitutionVerified ? "Verified" : "Pending"} · Overall:{" "}
              {hospital.verified ? "Verified" : "Unverified"}
            </p>
            <label className="label">Business registration number</label>
            <input
              className="input"
              name="businessRegistration"
              required
              defaultValue={String(hospital.businessRegistration || "BR-TOKYO-001")}
            />
            <button className="btn btn-primary form-submit" type="submit">
              Verify business registration
            </button>
          </form>

          <form
            className="panel"
            style={{ marginBottom: "1.25rem" }}
            onSubmit={async (e: FormEvent<HTMLFormElement>) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              await post("hospital_medical_institution", {
                medicalInstitutionReg: fd.get("medicalInstitutionReg"),
              });
            }}
          >
            <h2 style={{ marginTop: 0 }}>Hospital — Medical institution registration</h2>
            <label className="label">Medical institution registration</label>
            <input
              className="input"
              name="medicalInstitutionReg"
              required
              defaultValue={String(hospital.medicalInstitutionReg || "MI-12345")}
            />
            <button className="btn btn-primary form-submit" type="submit">
              Verify medical institution
            </button>
          </form>

          {(data?.pendingReviews || [])
            .filter((p) => p.type === "hospital_confirm")
            .map((p) => (
              <div key={p.id} className="panel" style={{ marginBottom: "0.75rem" }}>
                <p>
                  Confirm doctor {p.user?.name} ({p.user?.email})?
                </p>
                <button
                  className="btn btn-primary"
                  type="button"
                  onClick={() => post("hospital_confirm_doctor", { doctorUserId: p.user?.id })}
                >
                  Confirm affiliation
                </button>
              </div>
            ))}
        </>
      )}

      {role === "COMPANY" && (
        <>
          <form
            className="panel"
            style={{ marginBottom: "1.25rem" }}
            onSubmit={async (e: FormEvent<HTMLFormElement>) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              await post("company_business_reg", {
                businessRegistration: fd.get("businessRegistration"),
              });
            }}
          >
            <h2 style={{ marginTop: 0 }}>Company — Business registration</h2>
            <p className="muted">
              Business: {company.businessRegVerified ? "Verified" : "Pending"} · Tax ID:{" "}
              {company.taxIdVerified ? "Verified" : "Pending"} · Overall:{" "}
              {company.verified ? "Verified" : "Unverified"}
            </p>
            <label className="label">Business registration</label>
            <input
              className="input"
              name="businessRegistration"
              required
              defaultValue={String(company.businessRegistration || "CORP-REG-88")}
            />
            <button className="btn btn-primary form-submit" type="submit">
              Verify business registration
            </button>
          </form>

          <form
            className="panel"
            style={{ marginBottom: "1.25rem" }}
            onSubmit={async (e: FormEvent<HTMLFormElement>) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              await post("company_tax_id", { taxId: fd.get("taxId") });
            }}
          >
            <h2 style={{ marginTop: 0 }}>Company — Tax ID verification</h2>
            <label className="label">Tax ID / corporate number (13 digits)</label>
            <input
              className="input"
              name="taxId"
              required
              defaultValue={String(company.taxId || "1234567890123")}
            />
            <button className="btn btn-primary form-submit" type="submit">
              Verify tax ID
            </button>
          </form>
        </>
      )}

      <div className="panel">
        <h2 style={{ marginTop: 0 }}>Verification history</h2>
        {(data?.verifications || []).length === 0 && <p className="muted">No records yet.</p>}
        {(data?.verifications || []).map((v) => (
          <div key={v.id} style={{ marginBottom: "0.5rem" }}>
            <span className="badge">{v.status}</span> {v.type} — {v.notes || ""}
          </div>
        ))}
      </div>
    </PageShell>
  );
}
