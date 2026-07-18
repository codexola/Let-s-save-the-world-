import { Role } from "@prisma/client";

export type PairType =
  | "PATIENT_DOCTOR"
  | "PATIENT_NURSE"
  | "PATIENT_HOSPITAL"
  | "DOCTOR_HOSPITAL"
  | "COMPANY_HOSPITAL"
  | "COMPANY_EMPLOYEE";

const ALLOWED: Record<string, PairType> = {
  "PATIENT:DOCTOR": "PATIENT_DOCTOR",
  "DOCTOR:PATIENT": "PATIENT_DOCTOR",
  "PATIENT:NURSE": "PATIENT_NURSE",
  "NURSE:PATIENT": "PATIENT_NURSE",
  "PATIENT:HOSPITAL": "PATIENT_HOSPITAL",
  "HOSPITAL:PATIENT": "PATIENT_HOSPITAL",
  "DOCTOR:HOSPITAL": "DOCTOR_HOSPITAL",
  "HOSPITAL:DOCTOR": "DOCTOR_HOSPITAL",
  "COMPANY:HOSPITAL": "COMPANY_HOSPITAL",
  "HOSPITAL:COMPANY": "COMPANY_HOSPITAL",
  "COMPANY:PATIENT": "COMPANY_EMPLOYEE",
  "PATIENT:COMPANY": "COMPANY_EMPLOYEE",
};

export function resolvePairType(roleA: Role | string, roleB: Role | string): PairType | null {
  return ALLOWED[`${roleA}:${roleB}`] || null;
}

export function contactsNeededForRole(role: Role | string): Role[] {
  switch (role) {
    case "PATIENT":
      return ["DOCTOR", "NURSE", "HOSPITAL"];
    case "DOCTOR":
      return ["PATIENT", "HOSPITAL"];
    case "NURSE":
      return ["PATIENT"];
    case "HOSPITAL":
      return ["PATIENT", "DOCTOR", "COMPANY"];
    case "COMPANY":
      return ["HOSPITAL", "PATIENT"];
    default:
      return ["PATIENT", "DOCTOR", "NURSE", "HOSPITAL", "COMPANY"];
  }
}
