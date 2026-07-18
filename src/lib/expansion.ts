import { prisma } from "./db";
import { audit } from "./auth";

const MODULES = [
  {
    key: "genomics",
    name: "Genomics and precision medicine",
    category: "precision",
    status: "planned",
    summary: "WGS/WES panels, pharmacogenomics, and treatment matching.",
    relatedHref: "/laboratory",
  },
  {
    key: "ai_rehab",
    name: "AI-assisted rehabilitation",
    category: "rehab",
    status: "beta",
    summary: "Personalized physio plans with wearable feedback loops.",
    relatedHref: "/home-care",
  },
  {
    key: "robotics_care",
    name: "Robotics-assisted care coordination",
    category: "ops",
    status: "planned",
    summary: "Robot tasking for logistics, med delivery, and rounding assists.",
    relatedHref: "/hospital",
  },
  {
    key: "smart_hospital_iot",
    name: "Smart hospital IoT integration",
    category: "iot",
    status: "beta",
    summary: "Beds, pumps, environmental sensors into the ops fabric.",
    relatedHref: "/beds",
  },
  {
    key: "dtx",
    name: "Digital therapeutics (DTx)",
    category: "therapy",
    status: "planned",
    summary: "Prescribable software therapies with adherence analytics.",
    relatedHref: "/chronic",
  },
  {
    key: "mental_health",
    name: "Mental health therapy programs",
    category: "behavioral",
    status: "beta",
    summary: "CBT modules, therapist matching, and crisis escalation.",
    relatedHref: "/health-coach",
  },
  {
    key: "nutrition",
    name: "Nutrition and meal planning services",
    category: "lifestyle",
    status: "beta",
    summary: "Dietitian protocols tied to chronic and coach goals.",
    relatedHref: "/health-coach",
  },
  {
    key: "dental_vision",
    name: "Dental and vision care modules",
    category: "specialty",
    status: "planned",
    summary: "Dental EHR extensions and vision refraction workflows.",
    relatedHref: "/imaging",
  },
  {
    key: "cross_border_telemedicine",
    name: "Cross-border telemedicine",
    category: "telemedicine",
    status: "planned",
    summary: "Licensure-aware consults across country packs.",
    relatedHref: "/telemedicine",
  },
  {
    key: "pop_health_networks",
    name: "Population health research networks",
    category: "research",
    status: "planned",
    summary: "Federated analytics across hospitals and universities.",
    relatedHref: "/research",
  },
];

export async function ensureExpansionSeed() {
  for (const m of MODULES) {
    await prisma.expansionModule.upsert({
      where: { key: m.key },
      update: {
        name: m.name,
        category: m.category,
        status: m.status,
        summary: m.summary,
        relatedHref: m.relatedHref,
        roadmapJson: JSON.stringify({
          phases: ["discovery", "pilot", "ga"],
          extensibility: "feature-flagged module slot",
        }),
      },
      create: {
        ...m,
        roadmapJson: JSON.stringify({
          phases: ["discovery", "pilot", "ga"],
          extensibility: "feature-flagged module slot",
        }),
      },
    });
  }
}

export async function listExpansionModules() {
  await ensureExpansionSeed();
  const modules = await prisma.expansionModule.findMany({ orderBy: { name: "asc" } });
  return {
    extensibility: {
      featureFlags: true,
      moduleSlots: true,
      apiPlatform: "/developers",
      note: "New clinical domains register as ExpansionModule + feature flag + nav entry.",
    },
    modules: modules.map((m) => ({
      ...m,
      roadmap: m.roadmapJson ? JSON.parse(m.roadmapJson) : null,
    })),
  };
}

export async function setExpansionStatus(opts: {
  key: string;
  status: string;
  actorId: string;
}) {
  const mod = await prisma.expansionModule.update({
    where: { key: opts.key },
    data: { status: opts.status },
  });
  await audit(opts.actorId, "expansion.status", "ExpansionModule", mod.id);
  return mod;
}
