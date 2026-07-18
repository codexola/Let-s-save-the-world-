import { prisma } from "./db";
import { checkMedicationInteractions, checkPatientMedicationInteractions } from "./ai-advanced";
import { audit } from "./auth";

export const CDS_DISCLAIMER =
  "AI Medical Decision Support assists healthcare professionals and does not replace clinical judgment. Verify all suggestions against patient context, guidelines, and local protocols.";

const DIFFERENTIALS: Record<string, Array<{ dx: string; likelihood: string; rationale: string }>> = {
  chest: [
    { dx: "Acute coronary syndrome", likelihood: "high", rationale: "Chest pain + vascular risk factors" },
    { dx: "Pulmonary embolism", likelihood: "moderate", rationale: "Consider if dyspnea/hypoxia/risk factors" },
    { dx: "GERD / musculoskeletal pain", likelihood: "moderate", rationale: "Common benign mimics" },
  ],
  fever: [
    { dx: "Community-acquired pneumonia", likelihood: "moderate", rationale: "Fever with respiratory symptoms" },
    { dx: "Urinary tract infection", likelihood: "moderate", rationale: "Especially in elderly / dysuria" },
    { dx: "Viral syndrome", likelihood: "high", rationale: "Self-limited febrile illness common" },
  ],
  headache: [
    { dx: "Migraine", likelihood: "high", rationale: "Recurrent primary headache pattern" },
    { dx: "Tension-type headache", likelihood: "moderate", rationale: "Band-like pressure" },
    { dx: "Secondary headache (red flags)", likelihood: "low-moderate", rationale: "Screen thunderclap, neuro deficit, fever" },
  ],
  default: [
    { dx: "Undifferentiated presentation", likelihood: "moderate", rationale: "Broaden history/exam; consider common + serious" },
    { dx: "Medication-related effect", likelihood: "low-moderate", rationale: "Review meds/allergies" },
  ],
};

const GUIDELINES = [
  { id: "htn", title: "Hypertension management", summary: "Confirm BP, lifestyle, start/titrate antihypertensives per risk; monitor electrolytes/renal." },
  { id: "dm2", title: "Type 2 diabetes", summary: "Individualize A1c target; metformin first-line if tolerated; screen complications." },
  { id: "cap", title: "Community pneumonia", summary: "Severity score, empiric abx by setting, reassess 48–72h." },
  { id: "acs", title: "Chest pain / ACS pathway", summary: "ECG, troponin pathway, risk stratification, urgent cardiology if high risk." },
];

export async function runCdsSupport(opts: {
  clinicianId: string;
  patientId?: string;
  chiefComplaint: string;
  medications?: string[];
  labText?: string;
  imagingNotes?: string;
  docNotes?: string;
}) {
  const cc = opts.chiefComplaint.toLowerCase();
  let key = "default";
  if (/chest|angina|troponin/.test(cc)) key = "chest";
  else if (/fever|cough|pneumonia/.test(cc)) key = "fever";
  else if (/headache|migraine/.test(cc)) key = "headache";

  const differentials = DIFFERENTIALS[key] || DIFFERENTIALS.default;

  const interactions = opts.patientId
    ? await checkPatientMedicationInteractions(opts.patientId, opts.medications || [])
    : checkMedicationInteractions(opts.medications || []);

  const guidelines = GUIDELINES.filter((g) => {
    if (key === "chest") return g.id === "acs" || g.id === "htn";
    if (key === "fever") return g.id === "cap";
    if (/diabetes|glucose|a1c/.test(cc)) return g.id === "dm2";
    if (/hypertens|blood pressure|bp/.test(cc)) return g.id === "htn";
    return true;
  }).slice(0, 3);

  const risk = {
    models: [
      {
        name: "Short-term deterioration risk (demo)",
        score: /chest|shortness|syncope/.test(cc) ? 72 : /fever/.test(cc) ? 45 : 28,
        band: /chest|shortness|syncope/.test(cc) ? "elevated" : "routine",
        drivers: differentials.slice(0, 2).map((d) => d.dx),
      },
    ],
    note: "Risk models are probabilistic decision support only.",
  };

  const labInterp = opts.labText
    ? {
        summary: `Lab interpretation assist: ${opts.labText.slice(0, 200)}`,
        flags: [
          /troponin|elevated/i.test(opts.labText) ? "Cardiac biomarker attention" : null,
          /creatinine|egfr/i.test(opts.labText) ? "Renal function review" : null,
          /wbc|leukocyt/i.test(opts.labText) ? "Infection/inflammation context" : null,
        ].filter(Boolean),
        advice: "Correlate with clinical status and prior baselines; confirm critical values per lab policy.",
      }
    : {
        summary: "No lab text provided — upload or paste results for interpretation assist.",
        flags: [],
        advice: "Order indicated tests based on differential priorities.",
      };

  const imagingAssist = opts.imagingNotes
    ? `Imaging assistance: ${opts.imagingNotes}. Suggest correlation with differentials (${differentials.map((d) => d.dx).join("; ")}). Not a radiology report substitute.`
    : "No imaging notes provided — link MedCare Imaging studies for AI-assisted review.";

  const documentation = [
    `Chief complaint: ${opts.chiefComplaint}`,
    `Differential considerations: ${differentials.map((d) => d.dx).join("; ")}`,
    `Plan sketch: evaluate high-acuity diagnoses first; apply guidelines; reconcile medications (interactions reviewed).`,
    opts.docNotes ? `Clinician notes: ${opts.docNotes}` : "",
    CDS_DISCLAIMER,
  ]
    .filter(Boolean)
    .join("\n");

  const q = opts.chiefComplaint.slice(0, 80);
  const literature = await prisma.knowledgeItem.findMany({
    where: {
      published: true,
      OR: [
        { title: { contains: q.split(" ")[0] || "health" } },
        { tags: { contains: key === "default" ? "medical" : key } },
        { category: { contains: "research" } },
      ],
    },
    take: 8,
    orderBy: { createdAt: "desc" },
  });
  const monographs = await prisma.drugMonograph.findMany({ take: 5, orderBy: { createdAt: "desc" } });

  const session = await prisma.cdsSession.create({
    data: {
      clinicianId: opts.clinicianId,
      patientId: opts.patientId,
      chiefComplaint: opts.chiefComplaint,
      differentialsJson: JSON.stringify(differentials),
      interactionsJson: JSON.stringify(interactions),
      guidelinesJson: JSON.stringify(guidelines),
      riskJson: JSON.stringify(risk),
      labInterpJson: JSON.stringify(labInterp),
      imagingAssist,
      documentation,
      literatureJson: JSON.stringify({
        knowledge: literature.map((k) => ({ id: k.id, title: k.title, summary: k.summary, type: k.type })),
        monographs: monographs.map((m) => ({ id: m.id, name: m.name, summary: m.uses || m.warnings })),
      }),
      disclaimer: CDS_DISCLAIMER,
    },
  });

  await audit(opts.clinicianId, "cds.run", "CdsSession", session.id);

  return {
    sessionId: session.id,
    differentials,
    interactions,
    guidelines,
    risk,
    labInterpretation: labInterp,
    imagingAssistance: imagingAssist,
    documentationSupport: documentation,
    literature: {
      knowledge: literature,
      monographs,
    },
    disclaimer: CDS_DISCLAIMER,
  };
}
