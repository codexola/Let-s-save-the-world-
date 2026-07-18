import { prisma } from "./db";
import {
  expandSearchTerms,
  haversineKm,
  matchDiseaseCatalog,
  textIncludesAny,
  yearsFromGraduation,
} from "./search-catalog";

export type SearchFilters = {
  q?: string;
  type?: string;
  disease?: string;
  symptoms?: string;
  medication?: string;
  insurance?: string;
  location?: string;
  latitude?: number;
  longitude?: number;
  maxDistanceKm?: number;
  minPrice?: number;
  maxPrice?: number;
  minRating?: number;
  minExperience?: number;
  language?: string;
  availability?: string; // any|online|offline|home_visit
  gender?: string;
  department?: string;
  treatment?: string;
  onlineConsultation?: boolean;
  homeVisit?: boolean;
  emergencySupport?: boolean;
  sort?: string; // relevance|price_asc|price_desc|rating|distance|experience
  limit?: number;
};

export type ScoredDoctor = {
  id: string;
  userId: string;
  name: string;
  photoUrl: string | null;
  specialty: string | null;
  subspecialty: string | null;
  languages: string | null;
  gender: string | null;
  consultationFee: number | null;
  yearsExperience: number | null;
  treatmentMethods: string | null;
  onlineAvailable: boolean;
  offlineAvailable: boolean;
  successRate: number | null;
  avgRating: number | null;
  reviewCount: number;
  distanceKm: number | null;
  score: number;
  matchedOn: string[];
};

export type ScoredNurse = {
  id: string;
  userId: string;
  name: string;
  photoUrl: string | null;
  specialty: string | null;
  clinicalSpecialties: string | null;
  languages: string | null;
  gender: string | null;
  consultationFee: number | null;
  yearsExperience: number | null;
  treatmentMethods: string | null;
  onlineAvailable: boolean;
  homeVisitAvailable: boolean;
  successRate: number | null;
  avgRating: number | null;
  reviewCount: number;
  distanceKm: number | null;
  score: number;
  matchedOn: string[];
};

export type ScoredHospital = {
  id: string;
  userId: string;
  name: string;
  departments: string | null;
  acceptedInsurance: string | null;
  languages: string | null;
  address: string | null;
  treatmentMethods: string | null;
  emergencyAvailable: boolean;
  ambulance: boolean;
  latitude: number | null;
  longitude: number | null;
  avgRating: number | null;
  reviewCount: number;
  distanceKm: number | null;
  score: number;
  matchedOn: string[];
};

export type ScoredMedicine = {
  id: string;
  name: string;
  manufacturer: string | null;
  ingredients: string | null;
  priceYen: number;
  stock: number;
  pharmacyName: string | null;
  score: number;
  matchedOn: string[];
};

async function ratingMap(targetType: string) {
  const reviews = await prisma.review.findMany({
    where: { targetType },
    select: { targetId: true, rating: true },
  });
  const map = new Map<string, { sum: number; count: number }>();
  for (const r of reviews) {
    const cur = map.get(r.targetId) || { sum: 0, count: 0 };
    cur.sum += r.rating;
    cur.count += 1;
    map.set(r.targetId, cur);
  }
  return map;
}

function avgFromMap(map: Map<string, { sum: number; count: number }>, id: string) {
  const row = map.get(id);
  if (!row || !row.count) return { avg: null as number | null, count: 0 };
  return { avg: Math.round((row.sum / row.count) * 10) / 10, count: row.count };
}

function sortBy(items: Array<{ score: number; distanceKm?: number | null; consultationFee?: number | null; priceYen?: number; avgRating?: number | null; yearsExperience?: number | null }>, sort?: string) {
  const copy = [...items];
  switch (sort) {
    case "price_asc":
      return copy.sort(
        (a, b) =>
          (a.consultationFee ?? a.priceYen ?? 0) - (b.consultationFee ?? b.priceYen ?? 0)
      );
    case "price_desc":
      return copy.sort(
        (a, b) =>
          (b.consultationFee ?? b.priceYen ?? 0) - (a.consultationFee ?? a.priceYen ?? 0)
      );
    case "rating":
      return copy.sort((a, b) => (b.avgRating ?? 0) - (a.avgRating ?? 0));
    case "distance":
      return copy.sort((a, b) => (a.distanceKm ?? 9999) - (b.distanceKm ?? 9999));
    case "experience":
      return copy.sort((a, b) => (b.yearsExperience ?? 0) - (a.yearsExperience ?? 0));
    default:
      return copy.sort((a, b) => b.score - a.score);
  }
}

export async function runSearch(filters: SearchFilters) {
  const type = filters.type || "all";
  const limit = Math.min(filters.limit || 30, 100);
  const terms = expandSearchTerms(filters.q || "", filters.disease, filters.symptoms);
  const diseaseHits = [
    ...matchDiseaseCatalog(filters.q || ""),
    ...matchDiseaseCatalog(filters.disease || ""),
    ...matchDiseaseCatalog(filters.symptoms || ""),
  ];
  const specialtyHints = Array.from(
    new Set(diseaseHits.flatMap((d) => [...d.specialties, ...d.departments]))
  );
  const medHints = Array.from(new Set(diseaseHits.flatMap((d) => d.medications)));
  const treatmentHints = Array.from(new Set(diseaseHits.flatMap((d) => d.treatments)));

  const [doctorRatings, nurseRatings, hospitalRatings] = await Promise.all([
    ratingMap("doctor"),
    ratingMap("nurse"),
    ratingMap("hospital"),
  ]);

  const wantDoctors = type === "all" || type === "doctor";
  const wantNurses = type === "all" || type === "nurse";
  const wantHospitals = type === "all" || type === "hospital";
  const wantMeds =
    type === "all" || type === "medicine" || type === "medication" || Boolean(filters.medication);

  let doctors: ScoredDoctor[] = [];
  let nurses: ScoredNurse[] = [];
  let hospitals: ScoredHospital[] = [];
  let medicines: ScoredMedicine[] = [];

  if (wantDoctors) {
    const rows = await prisma.doctorProfile.findMany({
      include: {
        user: { select: { id: true, name: true, photoUrl: true, gender: true, active: true } },
      },
      take: 200,
    });
    doctors = rows
      .filter((d) => d.user.active)
      .map((d) => {
        const matchedOn: string[] = [];
        let score = 1;
        const blob = [
          d.user.name,
          d.specialty,
          d.subspecialty,
          d.clinicalExperience,
          d.languages,
          d.treatmentMethods,
          d.hospitalAffiliation,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        for (const t of terms) {
          if (blob.includes(t.toLowerCase())) {
            score += 3;
            matchedOn.push(`text:${t}`);
          }
        }
        for (const s of specialtyHints) {
          if (
            (d.specialty || "").toLowerCase().includes(s.toLowerCase().split(" ")[0]) ||
            (d.subspecialty || "").toLowerCase().includes(s.toLowerCase().split(" ")[0])
          ) {
            score += 5;
            matchedOn.push(`disease→specialty:${s}`);
          }
        }
        if (filters.department && textIncludesAny(d.specialty, [filters.department])) {
          score += 4;
          matchedOn.push("department");
        }
        if (filters.language && textIncludesAny(d.languages, [filters.language])) {
          score += 3;
          matchedOn.push("language");
        }
        if (filters.treatment && textIncludesAny(d.treatmentMethods, [filters.treatment, ...treatmentHints])) {
          score += 3;
          matchedOn.push("treatment");
        } else if (treatmentHints.length && textIncludesAny(d.treatmentMethods, treatmentHints)) {
          score += 2;
          matchedOn.push("treatment-hint");
        }
        if (filters.gender && (d.user.gender || "").toLowerCase() === filters.gender.toLowerCase()) {
          score += 2;
          matchedOn.push("gender");
        }

        const years =
          d.yearsExperience ?? yearsFromGraduation(d.graduationYear) ?? null;
        const { avg, count } = avgFromMap(doctorRatings, d.userId);

        return {
          id: d.id,
          userId: d.userId,
          name: d.user.name,
          photoUrl: d.user.photoUrl,
          specialty: d.specialty,
          subspecialty: d.subspecialty,
          languages: d.languages,
          gender: d.user.gender,
          consultationFee: d.consultationFee,
          yearsExperience: years,
          treatmentMethods: d.treatmentMethods,
          onlineAvailable: d.onlineAvailable,
          offlineAvailable: d.offlineAvailable,
          successRate: d.successRate,
          avgRating: avg,
          reviewCount: count,
          distanceKm: null as number | null,
          score,
          matchedOn,
          _online: d.onlineAvailable,
          _offline: d.offlineAvailable,
          _schedule: d.schedule,
        };
      })
      .filter((d) => {
        if (filters.onlineConsultation || filters.availability === "online") {
          if (!d._online) return false;
        }
        if (filters.availability === "offline" && !d._offline) return false;
        if (filters.minPrice != null && (d.consultationFee ?? 0) < filters.minPrice) return false;
        if (filters.maxPrice != null && (d.consultationFee ?? Infinity) > filters.maxPrice) return false;
        if (filters.minRating != null && (d.avgRating ?? 0) < filters.minRating) return false;
        if (filters.minExperience != null && (d.yearsExperience ?? 0) < filters.minExperience) {
          return false;
        }
        if (filters.gender && (d.gender || "").toLowerCase() !== filters.gender.toLowerCase()) {
          return false;
        }
        if (filters.language && !textIncludesAny(d.languages, [filters.language])) return false;
        if (filters.treatment && !textIncludesAny(d.treatmentMethods, [filters.treatment])) {
          return false;
        }
        if (filters.department && !textIncludesAny(`${d.specialty} ${d.subspecialty}`, [filters.department])) {
          return false;
        }
        if (terms.length && d.matchedOn.length === 0 && (filters.q || filters.disease || filters.symptoms)) {
          return false;
        }
        return true;
      })
      .map(({ _online, _offline, _schedule, ...rest }) => rest);

    doctors = sortBy(doctors, filters.sort).slice(0, limit) as ScoredDoctor[];
  }

  if (wantNurses) {
    const rows = await prisma.nurseProfile.findMany({
      include: {
        user: { select: { id: true, name: true, photoUrl: true, gender: true, active: true } },
      },
      take: 200,
    });
    nurses = rows
      .filter((n) => n.user.active)
      .map((n) => {
        const matchedOn: string[] = [];
        let score = 1;
        const blob = [
          n.user.name,
          n.specialty,
          n.clinicalSpecialties,
          n.languages,
          n.treatmentMethods,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        for (const t of terms) {
          if (blob.includes(t.toLowerCase())) {
            score += 3;
            matchedOn.push(`text:${t}`);
          }
        }
        for (const s of specialtyHints) {
          if (blob.includes(s.toLowerCase().split(" ")[0])) {
            score += 4;
            matchedOn.push(`disease→specialty:${s}`);
          }
        }
        if (filters.language && textIncludesAny(n.languages, [filters.language])) {
          score += 3;
          matchedOn.push("language");
        }
        if (n.homeVisitAvailable) score += 1;
        const years = n.yearsExperience ?? yearsFromGraduation(n.graduationYear);
        const { avg, count } = avgFromMap(nurseRatings, n.userId);
        return {
          id: n.id,
          userId: n.userId,
          name: n.user.name,
          photoUrl: n.user.photoUrl,
          specialty: n.specialty,
          clinicalSpecialties: n.clinicalSpecialties,
          languages: n.languages,
          gender: n.user.gender,
          consultationFee: n.consultationFee,
          yearsExperience: years,
          treatmentMethods: n.treatmentMethods,
          onlineAvailable: n.onlineAvailable,
          homeVisitAvailable: n.homeVisitAvailable,
          successRate: n.successRate,
          avgRating: avg,
          reviewCount: count,
          distanceKm: null as number | null,
          score,
          matchedOn,
        };
      })
      .filter((n) => {
        if ((filters.homeVisit || filters.availability === "home_visit") && !n.homeVisitAvailable) {
          return false;
        }
        if (filters.onlineConsultation && !n.onlineAvailable) return false;
        if (filters.minPrice != null && (n.consultationFee ?? 0) < filters.minPrice) return false;
        if (filters.maxPrice != null && (n.consultationFee ?? Infinity) > filters.maxPrice) return false;
        if (filters.minRating != null && (n.avgRating ?? 0) < filters.minRating) return false;
        if (filters.minExperience != null && (n.yearsExperience ?? 0) < filters.minExperience) {
          return false;
        }
        if (filters.gender && (n.gender || "").toLowerCase() !== filters.gender.toLowerCase()) {
          return false;
        }
        if (filters.language && !textIncludesAny(n.languages, [filters.language])) return false;
        if (filters.treatment && !textIncludesAny(n.treatmentMethods, [filters.treatment])) {
          return false;
        }
        if (terms.length && n.matchedOn.length === 0 && (filters.q || filters.disease || filters.symptoms)) {
          return false;
        }
        return true;
      });

    nurses = sortBy(nurses, filters.sort).slice(0, limit) as ScoredNurse[];
  }

  if (wantHospitals) {
    const rows = await prisma.hospitalProfile.findMany({
      include: { user: { select: { id: true, name: true, photoUrl: true, active: true } } },
      take: 200,
    });
    hospitals = rows
      .filter((h) => h.user.active)
      .map((h) => {
        const matchedOn: string[] = [];
        let score = 1;
        const blob = [
          h.name,
          h.departments,
          h.acceptedInsurance,
          h.languages,
          h.address,
          h.treatmentMethods,
          h.equipment,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        for (const t of terms) {
          if (blob.includes(t.toLowerCase())) {
            score += 3;
            matchedOn.push(`text:${t}`);
          }
        }
        for (const s of specialtyHints) {
          if ((h.departments || "").toLowerCase().includes(s.toLowerCase().split(" ")[0])) {
            score += 5;
            matchedOn.push(`disease→department:${s}`);
          }
        }
        if (filters.location && textIncludesAny(`${h.address} ${h.name}`, [filters.location])) {
          score += 4;
          matchedOn.push("location");
        }
        if (filters.insurance && textIncludesAny(h.acceptedInsurance, [filters.insurance])) {
          score += 4;
          matchedOn.push("insurance");
        }
        if (filters.department && textIncludesAny(h.departments, [filters.department])) {
          score += 4;
          matchedOn.push("department");
        }
        if (filters.language && textIncludesAny(h.languages, [filters.language])) {
          score += 3;
          matchedOn.push("language");
        }
        if (filters.treatment && textIncludesAny(h.treatmentMethods || h.equipment, [filters.treatment])) {
          score += 3;
          matchedOn.push("treatment");
        }
        if (h.emergencyAvailable) score += 1;

        let distanceKm: number | null = null;
        if (
          filters.latitude != null &&
          filters.longitude != null &&
          h.latitude != null &&
          h.longitude != null
        ) {
          distanceKm =
            Math.round(
              haversineKm(filters.latitude, filters.longitude, h.latitude, h.longitude) * 10
            ) / 10;
          score += Math.max(0, 10 - distanceKm);
          matchedOn.push(`distance:${distanceKm}km`);
        }

        const { avg, count } = avgFromMap(hospitalRatings, h.userId);
        return {
          id: h.id,
          userId: h.userId,
          name: h.name,
          departments: h.departments,
          acceptedInsurance: h.acceptedInsurance,
          languages: h.languages,
          address: h.address,
          treatmentMethods: h.treatmentMethods,
          emergencyAvailable: h.emergencyAvailable,
          ambulance: h.ambulance,
          latitude: h.latitude,
          longitude: h.longitude,
          avgRating: avg,
          reviewCount: count,
          distanceKm,
          score,
          matchedOn,
        };
      })
      .filter((h) => {
        if (filters.emergencySupport && !h.emergencyAvailable) return false;
        if (filters.insurance && !textIncludesAny(h.acceptedInsurance, [filters.insurance])) {
          return false;
        }
        if (filters.location && !textIncludesAny(`${h.address} ${h.name}`, [filters.location])) {
          return false;
        }
        if (filters.department && !textIncludesAny(h.departments, [filters.department])) {
          return false;
        }
        if (filters.language && !textIncludesAny(h.languages, [filters.language])) return false;
        if (filters.treatment && !textIncludesAny(h.treatmentMethods, [filters.treatment])) {
          return false;
        }
        if (filters.minRating != null && (h.avgRating ?? 0) < filters.minRating) return false;
        if (
          filters.maxDistanceKm != null &&
          h.distanceKm != null &&
          h.distanceKm > filters.maxDistanceKm
        ) {
          return false;
        }
        if (
          filters.maxDistanceKm != null &&
          h.distanceKm == null &&
          filters.latitude != null
        ) {
          return false;
        }
        if (terms.length && h.matchedOn.length === 0 && (filters.q || filters.disease || filters.symptoms || filters.location)) {
          // allow empty q with only facet filters
          if (filters.q || filters.disease || filters.symptoms) return false;
        }
        return true;
      });

    hospitals = sortBy(hospitals, filters.sort).slice(0, limit) as ScoredHospital[];
  }

  if (wantMeds) {
    const medQ = filters.medication || filters.q || "";
    const medTerms = expandSearchTerms(medQ, filters.disease, filters.symptoms);
    const allHints = [...medTerms, ...medHints];
    const rows = await prisma.medicine.findMany({
      include: { pharmacy: { select: { name: true } } },
      take: 200,
    });
    medicines = rows
      .map((m) => {
        const matchedOn: string[] = [];
        let score = 1;
        const blob = [m.name, m.manufacturer, m.ingredients, m.warnings]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        for (const t of allHints) {
          if (blob.includes(t.toLowerCase())) {
            score += 4;
            matchedOn.push(`text:${t}`);
          }
        }
        return {
          id: m.id,
          name: m.name,
          manufacturer: m.manufacturer,
          ingredients: m.ingredients,
          priceYen: m.priceYen,
          stock: m.stock,
          pharmacyName: m.pharmacy?.name || null,
          score,
          matchedOn,
        };
      })
      .filter((m) => {
        if (filters.minPrice != null && m.priceYen < filters.minPrice) return false;
        if (filters.maxPrice != null && m.priceYen > filters.maxPrice) return false;
        if (allHints.length && m.matchedOn.length === 0) {
          if (filters.medication || filters.q || filters.disease) return false;
        }
        return true;
      });

    medicines = sortBy(
      medicines.map((m) => ({ ...m, consultationFee: m.priceYen })),
      filters.sort === "experience" ? "relevance" : filters.sort
    )
      .slice(0, limit)
      .map(({ consultationFee: _c, ...rest }) => rest) as ScoredMedicine[];
  }

  const diseases = matchDiseaseCatalog(
    [filters.q, filters.disease, filters.symptoms].filter(Boolean).join(" ")
  );

  let blogs: Array<{
    id: string;
    title: string;
    category: string | null;
    tags: string | null;
    authorName: string | null;
    authorRole: string | null;
    likeCount: number;
    viewCount: number;
    score: number;
    matchedOn: string[];
  }> = [];

  const wantBlogs =
    type === "all" || type === "blog" || type === "article" || type === "news";
  if (wantBlogs) {
    const blogTerms = expandSearchTerms(filters.q || "", filters.disease, filters.symptoms);
    const rows = await prisma.blogPost.findMany({
      where: { published: true },
      include: { author: { select: { name: true, role: true } } },
      take: 100,
      orderBy: { createdAt: "desc" },
    });
    blogs = rows
      .map((b) => {
        const matchedOn: string[] = [];
        let score = 1;
        const blob = [b.title, b.content, b.tags, b.category]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        for (const t of blogTerms) {
          if (blob.includes(t.toLowerCase())) {
            score += 5;
            matchedOn.push(`text:${t}`);
          }
        }
        score += Math.min(3, Math.floor(b.likeCount / 5));
        return {
          id: b.id,
          title: b.title,
          category: b.category,
          tags: b.tags,
          authorName: b.author?.name || null,
          authorRole: b.author?.role || null,
          likeCount: b.likeCount,
          viewCount: b.viewCount,
          score,
          matchedOn,
        };
      })
      .filter((b) => {
        if (blogTerms.length && b.matchedOn.length === 0 && (filters.q || filters.disease)) {
          return false;
        }
        return true;
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  return {
    doctors,
    nurses,
    hospitals,
    medicines,
    blogs,
    diseases,
    filters,
    meta: {
      termCount: terms.length,
      specialtyHints,
      resultCounts: {
        doctors: doctors.length,
        nurses: nurses.length,
        hospitals: hospitals.length,
        medicines: medicines.length,
        blogs: blogs.length,
      },
    },
  };
}

export function parseSearchParams(sp: URLSearchParams): SearchFilters {
  const num = (k: string) => {
    const v = sp.get(k);
    if (v == null || v === "") return undefined;
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  };
  const bool = (k: string) => {
    const v = sp.get(k);
    if (v == null || v === "") return undefined;
    return v === "1" || v === "true" || v === "yes";
  };
  return {
    q: sp.get("q") || undefined,
    type: sp.get("type") || "all",
    disease: sp.get("disease") || undefined,
    symptoms: sp.get("symptoms") || undefined,
    medication: sp.get("medication") || undefined,
    insurance: sp.get("insurance") || undefined,
    location: sp.get("location") || undefined,
    latitude: num("latitude") ?? num("lat"),
    longitude: num("longitude") ?? num("lng"),
    maxDistanceKm: num("maxDistanceKm") ?? num("distance"),
    minPrice: num("minPrice"),
    maxPrice: num("maxPrice"),
    minRating: num("minRating"),
    minExperience: num("minExperience"),
    language: sp.get("language") || undefined,
    availability: sp.get("availability") || undefined,
    gender: sp.get("gender") || undefined,
    department: sp.get("department") || undefined,
    treatment: sp.get("treatment") || undefined,
    onlineConsultation: bool("onlineConsultation") ?? bool("online"),
    homeVisit: bool("homeVisit"),
    emergencySupport: bool("emergencySupport") ?? bool("emergency"),
    sort: sp.get("sort") || "relevance",
    limit: num("limit"),
  };
}
