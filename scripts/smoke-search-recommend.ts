import { runSearch } from "../src/lib/search-engine";
import { buildRecommendations } from "../src/lib/recommend";
import { prisma } from "../src/lib/db";

async function main() {
  const r = await runSearch({
    disease: "hypertension",
    language: "English",
    onlineConsultation: true,
    latitude: 35.6812,
    longitude: 139.7671,
    sort: "relevance",
  });
  console.log(
    JSON.stringify(
      {
        doctors: r.doctors.slice(0, 2).map((d) => ({
          name: d.name,
          score: d.score,
          rating: d.avgRating,
          fee: d.consultationFee,
        })),
        hospitals: r.hospitals.slice(0, 2).map((h) => ({
          name: h.name,
          km: h.distanceKm,
          emergency: h.emergencyAvailable,
        })),
        medicines: r.medicines.slice(0, 2).map((m) => m.name),
        diseases: r.diseases.map((d) => d.name),
      },
      null,
      2
    )
  );
  const p = await prisma.user.findUnique({ where: { email: "patient@medcare.local" } });
  const rec = await buildRecommendations(p!.id, { latitude: 35.6812, longitude: 139.7671 });
  console.log(
    "REC",
    rec.doctors.slice(0, 3).map((d) => ({
      name: d.name,
      score: Math.round(d.score),
      reasons: d.reasons.slice(0, 3),
    }))
  );
  console.log("signals", rec.profileUsed);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
