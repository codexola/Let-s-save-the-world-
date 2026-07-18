import { prisma } from "./db";
import { ageFromDob, haversineKm, matchDiseaseCatalog, parseCsv, textIncludesAny } from "./search-catalog";
import { runSearch, type ScoredDoctor, type ScoredHospital, type ScoredNurse } from "./search-engine";

export type RecommendResult = {
  doctors: Array<ScoredDoctor & { reasons: string[] }>;
  nurses: Array<ScoredNurse & { reasons: string[] }>;
  hospitals: Array<ScoredHospital & { reasons: string[] }>;
  profileUsed: {
    age: number | null;
    gender: string | null;
    medicalHistory: string | null;
    insurance: string | null;
    incomeBracket: string | null;
    preferredLanguage: string | null;
    favoriteDoctors: string[];
    pastDoctorIds: string[];
    conditionHints: string[];
  };
  weights: Record<string, number>;
};

const WEIGHTS = {
  medicalCondition: 18,
  age: 4,
  gender: 6,
  medicalHistory: 10,
  income: 5,
  insurance: 8,
  language: 7,
  distance: 10,
  pastReviews: 9,
  pastAppointments: 8,
  preferredDoctors: 12,
  availability: 6,
  aiScoring: 10,
  popularity: 5,
  treatmentSuccess: 8,
};

function incomeFeeFit(bracket: string | null | undefined, fee: number | null | undefined): number {
  if (!bracket || fee == null) return 0;
  const b = bracket.toLowerCase();
  if (b === "low") return fee <= 4000 ? 5 : fee <= 6000 ? 2 : -3;
  if (b === "middle") return fee <= 8000 ? 4 : fee <= 12000 ? 2 : 0;
  if (b === "high") return fee >= 5000 ? 4 : 1;
  return 0;
}

function ageSpecialtyBoost(age: number | null, specialty: string | null): { pts: number; reason?: string } {
  if (age == null || !specialty) return { pts: 0 };
  const s = specialty.toLowerCase();
  if (age < 18 && /pedia|小児/.test(s)) return { pts: 6, reason: "Age-matched pediatrics" };
  if (age >= 65 && /geriatr|老年|internal|内科|cardio|循環/.test(s)) {
    return { pts: 4, reason: "Age-appropriate adult/geriatric care" };
  }
  if (age >= 18 && age < 45 && /ob.?gyn|産婦|mental|精神/.test(s)) {
    return { pts: 2, reason: "Age-relevant specialty" };
  }
  return { pts: 0 };
}

export async function buildRecommendations(
  userId: string,
  opts?: { latitude?: number; longitude?: number; limit?: number }
): Promise<RecommendResult> {
  const limit = opts?.limit ?? 8;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      patientProfile: true,
      ehr: true,
      appointments: {
        where: { status: { in: ["BOOKED", "COMPLETED", "RESCHEDULED"] } },
        orderBy: { scheduledAt: "desc" },
        take: 50,
      },
      reviews: { take: 50 },
      aiConsultations: { orderBy: { createdAt: "desc" }, take: 5 },
    },
  });

  if (!user) {
    return {
      doctors: [],
      nurses: [],
      hospitals: [],
      profileUsed: {
        age: null,
        gender: null,
        medicalHistory: null,
        insurance: null,
        incomeBracket: null,
        preferredLanguage: null,
        favoriteDoctors: [],
        pastDoctorIds: [],
        conditionHints: [],
      },
      weights: WEIGHTS,
    };
  }

  const age = ageFromDob(user.dateOfBirth);
  const history = [
    user.patientProfile?.medicalHistory,
    user.ehr?.diagnoses,
    user.ehr?.treatments,
    user.patientProfile?.allergies,
  ]
    .filter(Boolean)
    .join(" ");
  const insurance = user.patientProfile?.insuranceInfo || "";
  const language =
    user.patientProfile?.preferredLanguage ||
    (user.locale === "ja" ? "日本語" : user.locale === "en" ? "English" : user.locale);
  const favorites = parseCsv(user.patientProfile?.favoriteDoctors);
  const favoriteHospitals = parseCsv(user.patientProfile?.favoriteHospitals);
  const pastDoctorIds = Array.from(
    new Set(user.appointments.map((a) => a.doctorId).filter(Boolean) as string[])
  );

  const conditionHints: string[] = [];
  for (const c of user.aiConsultations) {
    if (c.specialty) conditionHints.push(c.specialty);
    if (c.symptoms) conditionHints.push(c.symptoms);
    try {
      const preds = c.diseasePredictions ? JSON.parse(c.diseasePredictions) : [];
      for (const p of preds) if (p?.name) conditionHints.push(String(p.name));
    } catch {
      /* ignore */
    }
  }
  if (history) conditionHints.push(history);

  const diseaseQuery = conditionHints.slice(0, 6).join(" ");
  const catalogHits = matchDiseaseCatalog(diseaseQuery || history || "");

  const search = await runSearch({
    q: "",
    type: "all",
    disease: catalogHits[0]?.name || diseaseQuery || undefined,
    symptoms: user.aiConsultations[0]?.symptoms || undefined,
    insurance: insurance || undefined,
    language: language || undefined,
    latitude: opts?.latitude,
    longitude: opts?.longitude,
    sort: "relevance",
    limit: 50,
  });

  // Popularity proxies: appointment counts + review counts
  const appointmentCounts = await prisma.appointment.groupBy({
    by: ["doctorId"],
    where: { doctorId: { not: null } },
    _count: { doctorId: true },
  });
  const popularity = new Map(
    appointmentCounts
      .filter((a) => a.doctorId)
      .map((a) => [a.doctorId!, a._count.doctorId])
  );

  const highRatedTargets = new Set(
    user.reviews.filter((r) => r.rating >= 4).map((r) => r.targetId)
  );

  const doctors = search.doctors.map((d) => {
    const reasons: string[] = [];
    let bonus = 0;

    // Medical condition / AI scoring from search matchedOn
    if (d.matchedOn.some((m) => m.startsWith("disease"))) {
      bonus += WEIGHTS.medicalCondition;
      reasons.push("Matches your medical condition / AI specialty");
    } else if (d.matchedOn.length) {
      bonus += WEIGHTS.aiScoring / 2;
    }

    const ageBoost = ageSpecialtyBoost(age, d.specialty);
    if (ageBoost.pts) {
      bonus += ageBoost.pts;
      if (ageBoost.reason) reasons.push(ageBoost.reason);
    }

    if (user.gender && d.gender && user.gender.toLowerCase() === d.gender.toLowerCase()) {
      bonus += WEIGHTS.gender;
      reasons.push("Preferred gender match");
    }

    if (history && textIncludesAny(`${d.specialty} ${d.treatmentMethods}`, history.split(/[\s,、]+/).filter((w) => w.length > 3))) {
      bonus += WEIGHTS.medicalHistory;
      reasons.push("Aligned with medical history");
    }

    const incomePts = incomeFeeFit(user.patientProfile?.incomeBracket, d.consultationFee);
    if (incomePts) {
      bonus += incomePts > 0 ? WEIGHTS.income : incomePts;
      reasons.push(incomePts > 0 ? "Fee fits income preference" : "Fee above typical income band");
    }

    if (language && textIncludesAny(d.languages, [language, "English", "日本語"])) {
      bonus += WEIGHTS.language;
      reasons.push(`Language: ${d.languages}`);
    }

    if (d.avgRating != null) {
      bonus += (d.avgRating / 5) * WEIGHTS.pastReviews;
      reasons.push(`Community rating ${d.avgRating}★ (${d.reviewCount})`);
    }
    if (highRatedTargets.has(d.userId)) {
      bonus += WEIGHTS.pastReviews;
      reasons.push("You previously rated this provider highly");
    }

    if (pastDoctorIds.includes(d.userId)) {
      bonus += WEIGHTS.pastAppointments;
      reasons.push("From your past appointments");
    }

    if (favorites.some((f) => d.name.toLowerCase().includes(f.toLowerCase()) || f.toLowerCase().includes(d.name.toLowerCase()))) {
      bonus += WEIGHTS.preferredDoctors;
      reasons.push("Matches preferred doctors");
    }

    if (d.onlineAvailable) {
      bonus += WEIGHTS.availability;
      reasons.push("Online consultation available");
    }

    const pop = popularity.get(d.userId) || 0;
    if (pop > 0) {
      bonus += Math.min(WEIGHTS.popularity, pop);
      reasons.push(`Popular (${pop} bookings)`);
    }

    if (d.successRate != null) {
      bonus += (d.successRate / 100) * WEIGHTS.treatmentSuccess;
      reasons.push(`Treatment success indicator ${d.successRate}%`);
    }

    // AI base score from search
    bonus += Math.min(WEIGHTS.aiScoring, d.score);

    return {
      ...d,
      score: d.score + bonus,
      reasons: Array.from(new Set(reasons)),
    };
  });

  const nurses = search.nurses.map((n) => {
    const reasons: string[] = [];
    let bonus = 0;
    if (n.matchedOn.some((m) => m.startsWith("disease"))) {
      bonus += WEIGHTS.medicalCondition;
      reasons.push("Condition-aligned nursing specialty");
    }
    if (language && textIncludesAny(n.languages, [language, "English", "日本語"])) {
      bonus += WEIGHTS.language;
      reasons.push(`Language: ${n.languages}`);
    }
    if (n.homeVisitAvailable) {
      bonus += WEIGHTS.availability;
      reasons.push("Home visit available");
    }
    if (n.avgRating != null) {
      bonus += (n.avgRating / 5) * WEIGHTS.pastReviews;
      reasons.push(`Rating ${n.avgRating}★`);
    }
    if (n.successRate != null) {
      bonus += (n.successRate / 100) * WEIGHTS.treatmentSuccess;
      reasons.push(`Success indicator ${n.successRate}%`);
    }
    if (user.gender && n.gender && user.gender.toLowerCase() === n.gender.toLowerCase()) {
      bonus += WEIGHTS.gender / 2;
      reasons.push("Gender preference");
    }
    bonus += Math.min(WEIGHTS.aiScoring, n.score);
    return { ...n, score: n.score + bonus, reasons: Array.from(new Set(reasons)) };
  });

  const hospitals = search.hospitals.map((h) => {
    const reasons: string[] = [];
    let bonus = 0;
    if (h.matchedOn.some((m) => m.startsWith("disease"))) {
      bonus += WEIGHTS.medicalCondition;
      reasons.push("Department matches your condition");
    }
    if (insurance && textIncludesAny(h.acceptedInsurance, parseCsv(insurance).concat([insurance]))) {
      bonus += WEIGHTS.insurance;
      reasons.push("Accepts your insurance");
    } else if (insurance && textIncludesAny(h.acceptedInsurance, ["国民", " kenpo", "保険", "insurance"])) {
      bonus += WEIGHTS.insurance / 2;
      reasons.push("Broad insurance acceptance");
    }
    if (language && textIncludesAny(h.languages, [language, "English", "日本語"])) {
      bonus += WEIGHTS.language;
      reasons.push(`Languages: ${h.languages}`);
    }
    if (h.distanceKm != null) {
      bonus += Math.max(0, WEIGHTS.distance - h.distanceKm);
      reasons.push(`${h.distanceKm} km away`);
    }
    if (favoriteHospitals.some((f) => h.name.toLowerCase().includes(f.toLowerCase()))) {
      bonus += WEIGHTS.preferredDoctors;
      reasons.push("Preferred hospital");
    }
    if (h.avgRating != null) {
      bonus += (h.avgRating / 5) * WEIGHTS.pastReviews;
      reasons.push(`Rating ${h.avgRating}★`);
    }
    if (h.emergencyAvailable) {
      bonus += 2;
      reasons.push("Emergency support");
    }
    // popularity proxy: beds
    bonus += Math.min(WEIGHTS.popularity, (h as ScoredHospital & { totalBeds?: number }).totalBeds ? 3 : 1);
    bonus += Math.min(WEIGHTS.aiScoring, h.score);
    return { ...h, score: h.score + bonus, reasons: Array.from(new Set(reasons)) };
  });

  // Recompute hospital distance if lat provided but search didn't (already in search)
  if (opts?.latitude != null && opts?.longitude != null) {
    for (const h of hospitals) {
      if (h.latitude != null && h.longitude != null && h.distanceKm == null) {
        h.distanceKm =
          Math.round(haversineKm(opts.latitude, opts.longitude, h.latitude, h.longitude) * 10) / 10;
      }
    }
  }

  doctors.sort((a, b) => b.score - a.score);
  nurses.sort((a, b) => b.score - a.score);
  hospitals.sort((a, b) => b.score - a.score);

  return {
    doctors: doctors.slice(0, limit),
    nurses: nurses.slice(0, limit),
    hospitals: hospitals.slice(0, limit),
    profileUsed: {
      age,
      gender: user.gender,
      medicalHistory: user.patientProfile?.medicalHistory || null,
      insurance: insurance || null,
      incomeBracket: user.patientProfile?.incomeBracket || null,
      preferredLanguage: language || null,
      favoriteDoctors: favorites,
      pastDoctorIds,
      conditionHints: conditionHints.slice(0, 10),
    },
    weights: WEIGHTS,
  };
}
