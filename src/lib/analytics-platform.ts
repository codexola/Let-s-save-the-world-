import { prisma } from "./db";
import { buildPublicHealthDashboard } from "./public-health";

export async function ensureAnalyticsPlatformSeed() {
  const trendCount = await prisma.medicineTrendPoint.count();
  if (trendCount === 0) {
    const names = ["Amlodipine", "Metformin", "Atorvastatin", "Losartan", "Omeprazole"];
    const days = 14;
    for (let d = days; d >= 0; d--) {
      const day = new Date();
      day.setHours(0, 0, 0, 0);
      day.setDate(day.getDate() - d);
      for (const medicineName of names) {
        const prescriptions = 20 + Math.floor(Math.random() * 40) + (medicineName === "Metformin" ? 15 : 0);
        await prisma.medicineTrendPoint.create({
          data: {
            medicineName,
            day,
            prescriptions,
            revenueYen: prescriptions * (800 + Math.floor(Math.random() * 400)),
          },
        });
      }
    }
  }

  const forecastCount = await prisma.demandForecast.count();
  if (forecastCount === 0) {
    const resources = [
      { resourceType: "ed_visits", region: "Tokyo" },
      { resourceType: "icu_beds", region: "Tokyo" },
      { resourceType: "outpatient_slots", region: "Osaka" },
      { resourceType: "lab_capacity", region: "Tokyo" },
      { resourceType: "imaging_slots", region: "Nagoya" },
    ];
    for (let d = 0; d < 7; d++) {
      const day = new Date();
      day.setHours(0, 0, 0, 0);
      day.setDate(day.getDate() + d);
      for (const r of resources) {
        const predicted = 50 + d * 3 + Math.floor(Math.random() * 20);
        await prisma.demandForecast.create({
          data: {
            ...r,
            day,
            predicted,
            actual: d === 0 ? predicted - 2 : null,
            confidence: 0.72 + Math.random() * 0.2,
          },
        });
      }
    }
  }
}

export async function buildExecutiveDashboard() {
  await ensureAnalyticsPlatformSeed();

  const [
    users,
    doctors,
    hospitals,
    appointments,
    completedAppts,
    prescriptions,
    invoicesPaid,
    invoicesOpen,
    reviews,
    platformReviews,
    emergencies,
    beds,
    telemedicine,
    labOrders,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { role: "DOCTOR" } }),
    prisma.hospitalProfile.count(),
    prisma.appointment.count(),
    prisma.appointment.count({ where: { status: "COMPLETED" } }),
    prisma.prescription.count(),
    prisma.invoice.aggregate({
      where: { status: { in: ["PAID", "PARTIAL_REFUND"] } },
      _sum: { amountYen: true },
      _count: { _all: true },
    }),
    prisma.invoice.aggregate({
      where: { status: "OPEN" },
      _sum: { amountYen: true },
      _count: { _all: true },
    }),
    prisma.review.aggregate({ _avg: { rating: true }, _count: { _all: true } }),
    prisma.platformReview.aggregate({ _avg: { rating: true }, _count: { _all: true } }),
    prisma.emergencyRequest.count({
      where: { createdAt: { gte: new Date(Date.now() - 7 * 86400_000) } },
    }),
    prisma.hospitalProfile.aggregate({
      _sum: { totalBeds: true, icuBeds: true, emergencyBeds: true },
    }),
    prisma.telemedicineSession.count(),
    prisma.laboratoryOrder.count(),
  ]);

  let populationHealth = null;
  try {
    populationHealth = await buildPublicHealthDashboard();
  } catch {
    populationHealth = null;
  }

  const doctorPerf = await prisma.user.findMany({
    where: { role: "DOCTOR", active: true },
    select: {
      id: true,
      name: true,
      doctorAppointments: { select: { status: true } },
    },
    take: 10,
  });

  const doctorPerformance = await Promise.all(
    doctorPerf.map(async (d) => {
      const total = d.doctorAppointments.length;
      const completed = d.doctorAppointments.filter((a) => a.status === "COMPLETED").length;
      const ratingAgg = await prisma.review.aggregate({
        where: { targetType: "doctor", targetId: d.id },
        _avg: { rating: true },
        _count: { _all: true },
      });
      return {
        doctorId: d.id,
        name: d.name,
        appointments: total,
        completed,
        completionRate: total ? Math.round((completed / total) * 100) : 0,
        avgRating: ratingAgg._avg.rating,
        reviewCount: ratingAgg._count._all,
      };
    })
  );

  const hospitalPerformance = await prisma.hospitalProfile.findMany({
    take: 10,
    select: {
      id: true,
      name: true,
      totalBeds: true,
      icuBeds: true,
      emergencyBeds: true,
      emergencyAvailable: true,
    },
  });

  const satisfaction = {
    clinicalReviews: {
      count: reviews._count._all,
      avgRating: reviews._avg.rating,
    },
    platformReviews: {
      count: platformReviews._count._all,
      avgRating: platformReviews._avg.rating,
    },
    npsProxy: Math.min(
      100,
      Math.round(((reviews._avg.rating || 4) / 5) * 70 + ((platformReviews._avg.rating || 4) / 5) * 30)
    ),
  };

  const since = new Date();
  since.setDate(since.getDate() - 14);
  const medicineTrends = await prisma.medicineTrendPoint.findMany({
    where: { day: { gte: since } },
    orderBy: [{ medicineName: "asc" }, { day: "asc" }],
  });
  const medicineSummary = Object.values(
    medicineTrends.reduce(
      (acc, row) => {
        const cur = acc[row.medicineName] || {
          medicineName: row.medicineName,
          prescriptions: 0,
          revenueYen: 0,
          points: [] as Array<{ day: string; prescriptions: number; revenueYen: number }>,
        };
        cur.prescriptions += row.prescriptions;
        cur.revenueYen += row.revenueYen;
        cur.points.push({
          day: row.day.toISOString().slice(0, 10),
          prescriptions: row.prescriptions,
          revenueYen: row.revenueYen,
        });
        acc[row.medicineName] = cur;
        return acc;
      },
      {} as Record<
        string,
        {
          medicineName: string;
          prescriptions: number;
          revenueYen: number;
          points: Array<{ day: string; prescriptions: number; revenueYen: number }>;
        }
      >
    )
  ).sort((a, b) => b.prescriptions - a.prescriptions);

  const demandForecasts = await prisma.demandForecast.findMany({
    where: { day: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } },
    orderBy: [{ day: "asc" }, { resourceType: "asc" }],
  });

  const resourceAllocation = demandForecasts.map((f) => ({
    resourceType: f.resourceType,
    region: f.region,
    day: f.day.toISOString().slice(0, 10),
    predictedDemand: f.predicted,
    suggestedStaffing:
      f.resourceType === "ed_visits"
        ? Math.ceil(f.predicted / 12)
        : f.resourceType === "icu_beds"
          ? Math.ceil(f.predicted * 0.15)
          : Math.ceil(f.predicted / 8),
    confidence: f.confidence,
  }));

  const financialReports = {
    revenueYen: invoicesPaid._sum.amountYen || 0,
    paidInvoices: invoicesPaid._count._all,
    openReceivablesYen: invoicesOpen._sum.amountYen || 0,
    openInvoices: invoicesOpen._count._all,
    period: "lifetime_paid_vs_open",
  };

  const predictiveAnalytics = {
    noShowRiskIndex: appointments
      ? Math.round(100 - (completedAppts / Math.max(1, appointments)) * 100)
      : 12,
    demandForecasts: demandForecasts.slice(0, 15),
    notes: "Demand and no-show proxies derived from appointments, EMS, and seeded forecasts.",
  };

  return {
    executiveKpis: {
      users,
      doctors,
      hospitals,
      appointments,
      completionRate: appointments ? Math.round((completedAppts / appointments) * 100) : 0,
      prescriptions,
      telemedicine,
      labOrders,
      emergencies7d: emergencies,
      beds: beds._sum,
      revenueYen: financialReports.revenueYen,
      satisfactionNpsProxy: satisfaction.npsProxy,
    },
    populationHealth: populationHealth
      ? {
          vaccinationStatistics: populationHealth.vaccinationStatistics,
          outbreakAlerts: populationHealth.outbreakAlerts?.length ?? 0,
          emergencyEvents: populationHealth.emergencyEvents,
          pandemicMonitoring: populationHealth.pandemicMonitoring,
        }
      : null,
    hospitalPerformance,
    doctorPerformance,
    patientSatisfaction: satisfaction,
    medicineTrends: medicineSummary,
    financialReports,
    demandPrediction: demandForecasts,
    resourceAllocation,
    predictiveAnalytics,
  };
}
