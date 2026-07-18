import { prisma } from "./db";
import { audit } from "./auth";
import { ensureTrialsSeed } from "./trials";

export async function ensureResearchSeed(ownerId: string) {
  await ensureTrialsSeed(ownerId);
  if ((await prisma.researchDataset.count()) === 0) {
    await prisma.researchDataset.createMany({
      data: [
        {
          ownerId,
          title: "De-identified hypertension cohort 2024–2025",
          institution: "Tokyo Central Hospital",
          description: "EHR-derived BP and medication adherence panel (n≈12k).",
          accessLevel: "restricted",
          recordCount: 12040,
          tags: "cardiology,hypertension",
        },
        {
          ownerId,
          title: "University sleep wearable dataset",
          institution: "University of Tokyo",
          description: "Anonymized sleep/HRV streams for mental health research.",
          accessLevel: "collaborative",
          recordCount: 8500,
          tags: "sleep,wearables",
        },
      ],
    });
  }
  if ((await prisma.researchPaper.count()) === 0) {
    await prisma.researchPaper.create({
      data: {
        authorId: ownerId,
        title: "Digital phenotyping for early heart failure decompensation",
        abstract: "We evaluate remote vitals for predicting HF admissions.",
        institution: "Tokyo Central Hospital / University partner",
        status: "published",
        doi: "10.1000/medcare.demo.2026.001",
        publishedAt: new Date(),
      },
    });
  }
  if ((await prisma.researchGrant.count()) === 0) {
    await prisma.researchGrant.create({
      data: {
        ownerId,
        title: "AMED digital therapeutics grant",
        agency: "AMED",
        amountYen: 48000000,
        status: "active",
        startDate: new Date("2025-04-01"),
        endDate: new Date("2027-03-31"),
        notes: "Milestone: recruit 200 participants via MedCare trials module.",
      },
    });
  }
  if ((await prisma.researchCollab.count()) === 0) {
    await prisma.researchCollab.createMany({
      data: [
        {
          title: "Multi-center PE imaging AI consortium",
          orgType: "hospital",
          orgName: "Tokyo Central Hospital",
          description: "Share annotated CT datasets under DUA.",
          status: "open",
        },
        {
          title: "University–hospital mental health digital CBT study",
          orgType: "university",
          orgName: "Keio University",
          description: "Joint protocol development and knowledge sharing.",
          status: "open",
        },
      ],
    });
  }
}

export async function researchDashboard(userId: string) {
  await ensureResearchSeed(userId);
  const [datasets, papers, grants, collabs, trials, hospitals, researchers] = await Promise.all([
    prisma.researchDataset.findMany({ orderBy: { createdAt: "desc" }, take: 50 }),
    prisma.researchPaper.findMany({
      include: { author: { select: { id: true, name: true, role: true } } },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.researchGrant.findMany({ orderBy: { createdAt: "desc" }, take: 50 }),
    prisma.researchCollab.findMany({ orderBy: { createdAt: "desc" }, take: 50 }),
    prisma.clinicalTrial.findMany({
      where: { status: "recruiting" },
      take: 20,
      orderBy: { createdAt: "desc" },
    }),
    prisma.hospitalProfile.findMany({
      take: 20,
      select: { id: true, name: true, address: true, userId: true },
    }),
    prisma.user.findMany({
      where: { role: { in: ["RESEARCHER", "DOCTOR"] }, active: true },
      select: { id: true, name: true, role: true, verified: true },
      take: 30,
    }),
  ]);

  const universities = [
    ...new Map(
      collabs
        .filter((c) => c.orgType === "university")
        .map((c) => [c.orgName, { name: c.orgName, type: "university", collaboration: c.title }])
    ).values(),
  ];
  if (universities.length === 0) {
    universities.push(
      { name: "University of Tokyo", type: "university", collaboration: "Sleep wearable dataset" },
      { name: "Keio University", type: "university", collaboration: "Digital CBT study" }
    );
  }

  const organizations = {
    hospitals: hospitals.map((h) => ({ id: h.id, name: h.name, type: "hospital", address: h.address })),
    universities,
    researchers,
  };

  return {
    datasets,
    papers,
    grants,
    collaborations: collabs,
    trialsForRecruitment: trials,
    organizations,
  };
}

export async function runResearchAiAnalysis(datasetId: string, actorId: string) {
  const ds = await prisma.researchDataset.findUnique({ where: { id: datasetId } });
  if (!ds) throw new Error("Dataset not found");
  const analysis = {
    dataset: ds.title,
    n: ds.recordCount,
    summary: `AI analysis (demo): estimated signal-to-noise OK; suggest stratified analysis by age/sex; ${Math.min(12, Math.round(ds.recordCount / 1000))} candidate features.`,
    knowledgeShare: "Results ready to attach to a paper draft or trial protocol.",
  };
  await audit(actorId, "research.ai_analysis", "ResearchDataset", ds.id);
  return analysis;
}
