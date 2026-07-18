import { prisma } from "./db";
import { getRealtimeBedStatus } from "./beds";

export async function ensurePublicHealthSeed() {
  const count = await prisma.outbreakAlert.count();
  if (count > 0) return;
  await prisma.outbreakAlert.createMany({
    data: [
      {
        disease: "Influenza A",
        region: "Tokyo Metro",
        severity: "moderate",
        caseCount: 1240,
        message: "Seasonal influenza activity above baseline in Tokyo. Promote vaccination.",
        active: true,
      },
      {
        disease: "COVID-19",
        region: "Kanto",
        severity: "low",
        caseCount: 320,
        message: "Stable COVID wastewater signals; continue surveillance.",
        active: true,
      },
      {
        disease: "Norovirus",
        region: "Osaka",
        severity: "elevated",
        caseCount: 88,
        message: "Cluster in care facilities — hygiene advisory issued.",
        active: true,
      },
    ],
  });
}

export async function createOutbreakAlert(opts: {
  disease: string;
  region: string;
  severity?: string;
  caseCount?: number;
  message: string;
}) {
  return prisma.outbreakAlert.create({
    data: {
      disease: opts.disease,
      region: opts.region,
      severity: opts.severity || "moderate",
      caseCount: opts.caseCount ?? 0,
      message: opts.message,
      active: true,
    },
  });
}

export async function buildPublicHealthSnapshot() {
  await ensurePublicHealthSeed();

  const [
    vaxCompleted,
    vaxUpcoming,
    campaigns,
    emergencies,
    alerts,
    hospitals,
    recentReports,
  ] = await Promise.all([
    prisma.vaccinationRecord.count({ where: { status: "completed" } }),
    prisma.vaccinationRecord.count({ where: { status: { in: ["upcoming", "due"] } } }),
    prisma.vaccinationCampaign.count({ where: { status: "active" } }),
    prisma.emergencyRequest.count({
      where: { createdAt: { gte: new Date(Date.now() - 7 * 86400_000) } },
    }),
    prisma.outbreakAlert.findMany({ where: { active: true }, orderBy: { reportedAt: "desc" } }),
    prisma.hospitalProfile.findMany({
      where: { emergencyAvailable: true },
      select: {
        name: true,
        totalBeds: true,
        icuBeds: true,
        emergencyBeds: true,
        latitude: true,
        longitude: true,
        address: true,
      },
    }),
    prisma.publicHealthReport.findMany({ orderBy: { generatedAt: "desc" }, take: 10 }),
  ]);

  let capacity = null;
  try {
    capacity = await getRealtimeBedStatus();
  } catch {
    capacity = null;
  }

  const regionalTrends = [
    { region: "Tokyo", influenza: 42, covid: 12, norovirus: 8 },
    { region: "Osaka", influenza: 28, covid: 9, norovirus: 15 },
    { region: "Nagoya", influenza: 18, covid: 7, norovirus: 5 },
    { region: "Fukuoka", influenza: 14, covid: 6, norovirus: 4 },
  ];

  const diseaseSurveillance = alerts.map((a) => ({
    disease: a.disease,
    region: a.region,
    cases: a.caseCount,
    severity: a.severity,
  }));

  const pandemicMonitoring = {
    status: "interpandemic surveillance",
    indicators: [
      { name: "Respiratory virus composite", value: "moderate", trend: "up" },
      {
        name: "Hospital ICU pressure",
        value: capacity?.realtime?.occupancyPercent ?? 65,
        trend: "stable",
      },
      { name: "Vaccine campaign coverage", value: campaigns, trend: "up" },
    ],
  };

  const governmentReporting = {
    title: `MedCare Public Health Brief — ${new Date().toISOString().slice(0, 10)}`,
    sections: {
      vaccinationStatistics: {
        completed: vaxCompleted,
        upcoming: vaxUpcoming,
        activeCampaigns: campaigns,
      },
      emergencyEvents7d: emergencies,
      outbreakAlerts: alerts.length,
      hospitalCapacity: capacity?.realtime || null,
    },
  };

  return {
    diseaseSurveillance,
    vaccinationStatistics: {
      completed: vaxCompleted,
      upcoming: vaxUpcoming,
      activeCampaigns: campaigns,
    },
    regionalTrends,
    hospitalCapacity: capacity,
    hospitals,
    emergencyEvents: { last7Days: emergencies },
    pandemicMonitoring,
    outbreakAlerts: alerts,
    governmentReporting,
    governmentReports: recentReports,
  };
}

export async function buildPublicHealthDashboard() {
  return buildPublicHealthSnapshot();
}

export async function generateGovernmentReport(opts?: {
  title?: string;
  reportType?: string;
  region?: string;
  summary?: string;
}) {
  const snap = await buildPublicHealthSnapshot();
  const payload = {
    ...snap.governmentReporting,
    summary: opts?.summary || null,
    generatedAt: new Date().toISOString(),
  };
  const report = await prisma.publicHealthReport.create({
    data: {
      title: opts?.title || snap.governmentReporting.title,
      reportType: opts?.reportType || "government_brief",
      region: opts?.region || "Japan",
      payloadJson: JSON.stringify(payload),
    },
  });
  return { report, governmentReporting: payload };
}
