/** Disease / symptom → specialty / department / treatment keyword mappings for search */

export type DiseaseEntry = {
  name: string;
  synonyms: string[];
  specialties: string[];
  departments: string[];
  treatments: string[];
  medications: string[];
};

export const DISEASE_CATALOG: DiseaseEntry[] = [
  {
    name: "Hypertension",
    synonyms: ["high blood pressure", "高血圧", "hypertension"],
    specialties: ["Internal Medicine", "Cardiology", "Cardiovascular"],
    departments: ["循環器", "内科", "Cardiology"],
    treatments: ["antihypertensive", "lifestyle", "blood pressure monitoring"],
    medications: ["amlodipine", "losartan", "血圧"],
  },
  {
    name: "Influenza",
    synonyms: ["flu", "インフルエンザ", "fever cough"],
    specialties: ["Internal Medicine", "ENT", "General Practice", "Pediatrics"],
    departments: ["内科", "耳鼻", "小児"],
    treatments: ["antiviral", "supportive care", "vaccination"],
    medications: ["oseltamivir", "acetaminophen", "paracetamol"],
  },
  {
    name: "Migraine",
    synonyms: ["頭痛", "headache", "migraine", "偏頭痛"],
    specialties: ["Neurology", "General Practice"],
    departments: ["神経", "Neurology", "内科"],
    treatments: ["triptan", "preventive therapy", "rest"],
    medications: ["sumatriptan", "ibuprofen"],
  },
  {
    name: "Anxiety / Depression",
    synonyms: ["anxiety", "depression", "うつ", "不安", "stress", "不眠"],
    specialties: ["Psychiatry", "Mental Health", "General Practice"],
    departments: ["精神", "Psychiatry", "心療"],
    treatments: ["counseling", "CBT", "SSRIs"],
    medications: ["sertraline", "anxiolytic"],
  },
  {
    name: "Gastroenteritis",
    synonyms: ["stomach flu", "下痢", "nausea", "腹痛", "diarrhea"],
    specialties: ["Gastroenterology", "Internal Medicine"],
    departments: ["消化器", "内科", "Gastro"],
    treatments: ["ORS", "hydration", "bland diet"],
    medications: ["oral rehydration", "loperamide"],
  },
  {
    name: "Dermatitis / Allergy",
    synonyms: ["rash", "発疹", "allergy", "アレルギー", "itch", "urticaria"],
    specialties: ["Dermatology", "Allergy"],
    departments: ["皮膚", "Dermatology", "アレルギー"],
    treatments: ["antihistamine", "topical steroid"],
    medications: ["antihistamine", "loratadine", "cetirizine"],
  },
  {
    name: "Cardiac ischemia",
    synonyms: ["chest pain", "胸痛", "heart attack", "心筋", "angina"],
    specialties: ["Cardiology", "Emergency Medicine", "Cardiovascular"],
    departments: ["循環器", "救急", "Cardiology", "Emergency"],
    treatments: ["ECG", "catheterization", "emergency care"],
    medications: ["aspirin", "nitroglycerin"],
  },
  {
    name: "Diabetes",
    synonyms: ["diabetes", "糖尿病", "blood sugar", "glucose"],
    specialties: ["Endocrinology", "Internal Medicine"],
    departments: ["内分泌", "糖尿病", "内科"],
    treatments: ["insulin", "diet therapy", "glucose monitoring"],
    medications: ["metformin", "insulin"],
  },
];

export function matchDiseaseCatalog(query: string): DiseaseEntry[] {
  const q = query.toLowerCase().trim();
  if (!q) return [];
  return DISEASE_CATALOG.filter(
    (d) =>
      d.name.toLowerCase().includes(q) ||
      d.synonyms.some((s) => s.toLowerCase().includes(q) || q.includes(s.toLowerCase())) ||
      d.specialties.some((s) => s.toLowerCase().includes(q)) ||
      d.medications.some((m) => m.toLowerCase().includes(q))
  );
}

export function expandSearchTerms(q: string, disease?: string, symptoms?: string): string[] {
  const terms = new Set<string>();
  for (const part of [q, disease, symptoms].filter(Boolean) as string[]) {
    terms.add(part.trim());
    for (const word of part.split(/[\s,、/|]+/).filter((w) => w.length > 1)) {
      terms.add(word);
    }
    for (const hit of matchDiseaseCatalog(part)) {
      terms.add(hit.name);
      hit.specialties.forEach((s) => terms.add(s));
      hit.departments.forEach((s) => terms.add(s));
      hit.treatments.forEach((s) => terms.add(s));
      hit.medications.forEach((s) => terms.add(s));
      hit.synonyms.forEach((s) => terms.add(s));
    }
  }
  return Array.from(terms).filter(Boolean);
}

export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function ageFromDob(dob: Date | string | null | undefined): number | null {
  if (!dob) return null;
  const d = typeof dob === "string" ? new Date(dob) : dob;
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age;
}

export function yearsFromGraduation(year: number | null | undefined): number | null {
  if (!year) return null;
  return Math.max(0, new Date().getFullYear() - year);
}

export function textIncludesAny(haystack: string | null | undefined, needles: string[]): boolean {
  if (!needles.length) return true;
  const h = (haystack || "").toLowerCase();
  if (!h) return false;
  return needles.some((n) => h.includes(n.toLowerCase()));
}

export function parseCsv(value: string | null | undefined): string[] {
  if (!value) return [];
  return value
    .split(/[,、]/)
    .map((s) => s.trim())
    .filter(Boolean);
}
