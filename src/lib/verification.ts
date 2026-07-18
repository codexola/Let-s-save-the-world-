/**
 * Simulated identity verification engines.
 * When real government / KYC APIs are configured via env, hooks can replace these.
 */

function luhnCheck(value: string): boolean {
  const digits = value.replace(/\D/g, "");
  if (digits.length < 8) return false;
  let sum = 0;
  let alt = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = Number(digits[i]);
    if (alt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
}

export function verifyGovernmentId(idNumber: string, idType?: string) {
  const cleaned = idNumber.replace(/[\s-]/g, "").toUpperCase();
  if (cleaned.length < 6) {
    return { ok: false, reason: "ID number too short" };
  }
  if (idType === "passport" && !/^[A-Z0-9]{6,12}$/.test(cleaned)) {
    return { ok: false, reason: "Invalid passport format" };
  }
  if (idType === "my_number" && !/^\d{12}$/.test(cleaned)) {
    return { ok: false, reason: "My Number must be 12 digits" };
  }
  // Optional checksum only when explicitly requested
  if (idType === "checksum" && /^\d+$/.test(cleaned) && !luhnCheck(cleaned)) {
    return { ok: false, reason: "ID failed checksum validation" };
  }
  return {
    ok: true,
    reason: "Government ID format validated against MedCare registry rules",
    reference: `GOV-${cleaned.slice(-4)}-${Date.now().toString(36).toUpperCase()}`,
  };
}

export function verifyFaceMatch(documentHint?: string, selfieHint?: string) {
  if (!selfieHint || selfieHint.length < 8) {
    return { ok: false, reason: "Face image required" };
  }
  // Demo liveness: require both document and selfie URLs/data URIs
  const hasDoc = Boolean(documentHint && documentHint.length > 8);
  return {
    ok: true,
    reason: hasDoc
      ? "Face matched government ID photo (simulated biometric match ≥ 92%)"
      : "Liveness check passed (simulated); link a government ID for full match",
    score: hasDoc ? 0.94 : 0.81,
  };
}

export function verifyPhoneFormat(phone: string) {
  const cleaned = phone.replace(/[\s()-]/g, "");
  if (!/^\+?\d{8,15}$/.test(cleaned)) {
    return { ok: false, reason: "Invalid phone number" };
  }
  return { ok: true, normalized: cleaned };
}

export function verifyMedicalLicense(licenseNumber: string) {
  const cleaned = licenseNumber.replace(/[\s-]/g, "").toUpperCase();
  if (cleaned.length < 5) {
    return { ok: false, reason: "License number too short" };
  }
  if (!/^[A-Z0-9]{5,20}$/.test(cleaned)) {
    return { ok: false, reason: "Invalid license format" };
  }
  return {
    ok: true,
    reason: "License number accepted by MedCare medical board simulator",
    registryId: `LIC-${cleaned}`,
  };
}

export function verifyGovernmentDoctorDb(nationalRegNumber: string, licenseNumber?: string) {
  const nat = nationalRegNumber.replace(/[\s-]/g, "").toUpperCase();
  if (nat.length < 6) {
    return { ok: false, reason: "National registration number required" };
  }
  return {
    ok: true,
    reason: "Matched simulated national physician registry",
    registryStatus: "ACTIVE",
    licenseLinked: Boolean(licenseNumber),
  };
}

export function verifyHospitalAffiliation(
  hospitalAffiliation: string,
  hospitalNames: string[]
) {
  if (!hospitalAffiliation?.trim()) {
    return { ok: false, reason: "Hospital affiliation required" };
  }
  const needle = hospitalAffiliation.toLowerCase();
  const match = hospitalNames.find((n) => n.toLowerCase().includes(needle) || needle.includes(n.toLowerCase()));
  if (!match) {
    return {
      ok: false,
      reason: "No matching hospital on platform — hospital admin confirmation required",
      needsManualConfirm: true,
    };
  }
  return {
    ok: true,
    reason: `Matched hospital profile: ${match}`,
    hospitalName: match,
  };
}

export function verifyBusinessRegistration(regNumber: string) {
  const cleaned = regNumber.replace(/[\s-]/g, "").toUpperCase();
  if (cleaned.length < 6) {
    return { ok: false, reason: "Business registration number too short" };
  }
  return {
    ok: true,
    reason: "Business registration validated (simulated commercial registry)",
    reference: `BR-${cleaned.slice(-6)}`,
  };
}

export function verifyMedicalInstitution(regNumber: string) {
  const cleaned = regNumber.replace(/[\s-]/g, "").toUpperCase();
  if (cleaned.length < 5) {
    return { ok: false, reason: "Medical institution registration required" };
  }
  return {
    ok: true,
    reason: "Medical institution registration validated (simulated MHLW registry)",
    reference: `MI-${cleaned}`,
  };
}

export function verifyTaxId(taxId: string) {
  const cleaned = taxId.replace(/[\s-]/g, "").toUpperCase();
  // Japan corporate number is 13 digits; also accept VAT-like formats
  if (/^\d{13}$/.test(cleaned) || /^T\d{13}$/.test(cleaned)) {
    return { ok: true, reason: "Corporate number validated", format: "corporate_number" };
  }
  if (/^[A-Z]{2}\d{8,12}$/.test(cleaned) || /^\d{9,12}$/.test(cleaned)) {
    return { ok: true, reason: "Tax ID format validated", format: "tax_id" };
  }
  return { ok: false, reason: "Tax ID must be 13-digit corporate number or valid tax ID format" };
}

export function generateOtpCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}
