import { ModulePage } from "@/components/module-page";

const MODULES: Record<
  string,
  { eyebrow: string; title: string; description: string; capabilities: string[] }
> = {
  telemedicine: {
    eyebrow: "Telemedicine",
    title: "Video consultation",
    description: "High-quality video visits with consent, recording, screen sharing, prescriptions, notes, and AI transcription.",
    capabilities: ["HD video sessions", "Consent capture", "Screen sharing", "Prescription generation", "AI transcription"],
  },
  pharmacy: {
    eyebrow: "Pharmacy",
    title: "Pharmacy fulfillment",
    description: "Inventory, prescription support, pickup, delivery, and stock status.",
    capabilities: ["Prescription workflow", "Inventory sync", "Pickup & delivery", "Discounts", "Stock alerts"],
  },
  marketplace: {
    eyebrow: "Marketplace",
    title: "Medication marketplace",
    description: "Medicine profiles, interactions, alternatives, price comparison, and reviews.",
    capabilities: ["Ingredient & interaction data", "Price comparison", "Alternatives", "Delivery options", "Reviews"],
  },
  ehr: {
    eyebrow: "EHR",
    title: "Electronic Health Record",
    description: "Lifelong patient record: diagnoses, labs, imaging, vaccinations, lifestyle, genetics, and insurance.",
    capabilities: ["Medical history", "Lab & imaging", "Medications & allergies", "Family history", "Consent-gated export"],
  },
  family: {
    eyebrow: "Family Health",
    title: "Manage dependents",
    description: "One account for parents, children, grandparents, spouse, and dependents.",
    capabilities: ["Shared appointments", "Medication management", "Vaccination records", "Family dashboard", "Emergency contacts"],
  },
  vaccination: {
    eyebrow: "Vaccinations",
    title: "Vaccination management",
    description: "History, boosters, digital certificates, travel and corporate campaigns.",
    capabilities: ["History & boosters", "Digital certificates", "Travel vaccines", "Corporate campaigns", "Reminders"],
  },
  laboratory: {
    eyebrow: "Laboratory",
    title: "Lab & diagnostics",
    description: "Orders from doctor → collection → analysis → digital results → patient notification.",
    capabilities: ["Blood / urine / DNA panels", "Home sample collection", "Turnaround tracking", "Doctor review", "Patient alerts"],
  },
  imaging: {
    eyebrow: "Imaging",
    title: "Medical imaging",
    description: "X-Ray, CT, MRI, PET, ultrasound, and AI-assisted review with secure share.",
    capabilities: ["Multi-modality viewer", "Annotation & measurement", "AI assistance", "Second opinion", "Secure sharing"],
  },
  hospital: {
    eyebrow: "Hospital Dashboard",
    title: "Hospital operations",
    description: "Beds, ICU, OR, occupancy, doctors, nurses, revenue, and ratings.",
    capabilities: ["Bed management", "Staff lists", "Occupancy forecast", "Revenue analytics", "Emergency readiness"],
  },
  corporate: {
    eyebrow: "Corporate Healthcare",
    title: "Employee health programs",
    description: "Checkups, participation, vaccinations, campaigns, certificates, and sick leave.",
    capabilities: ["Employee management", "Checkup schedules", "Participation rates", "Vaccination tracking", "Insurance support"],
  },
  blog: {
    eyebrow: "Medical Blog",
    title: "Knowledge & news",
    description: "Doctors, hospitals, and researchers publish articles with tags, likes, and bookmarks.",
    capabilities: ["Publish articles", "Tags & search", "Comments", "Likes & bookmarks", "Medical news"],
  },
  community: {
    eyebrow: "Community",
    title: "Healthcare social network",
    description: "Verified communities, disease groups, recovery stories, and moderated Q&A.",
    capabilities: ["Follow providers", "Disease communities", "Moderated Q&A", "Misinformation controls", "Professional badges"],
  },
  reviews: {
    eyebrow: "Reviews",
    title: "Verified reviews",
    description: "Patients review providers; anti-spam and AI fraud detection for verified appointments only.",
    capabilities: ["Doctor / hospital / pharmacy reviews", "Verified appointments only", "AI fraud detection", "Company ↔ hospital reviews"],
  },
  chat: {
    eyebrow: "Chat",
    title: "Secure messaging",
    description: "Encrypted chat across patients, clinicians, hospitals, and companies with file sharing.",
    capabilities: ["Patient ↔ clinician threads", "Voice / video / images", "PDF & prescriptions", "Company ↔ employee", "Encryption"],
  },
  billing: {
    eyebrow: "Billing",
    title: "Payments & invoices",
    description: "Cards, Apple/Google Pay, bank transfer, corporate billing, refunds, coupons, and ambassador discounts.",
    capabilities: ["Multi-method payments", "Invoices & refunds", "Coupons", "Corporate billing", "Ambassador discounts"],
  },
  wearables: {
    eyebrow: "Wearables",
    title: "Device integration",
    description: "Apple Health, Google Health Connect, Fitbit, Garmin, Samsung, Oura, WHOOP, Polar, Withings.",
    capabilities: ["Heart rate & SpO2", "Sleep & stress", "ECG & glucose", "Steps & calories", "Real-time sync"],
  },
  rpm: {
    eyebrow: "Remote Monitoring",
    title: "Remote patient monitoring",
    description: "AI monitors vitals, adherence, daily health score, and alerts clinicians on anomalies.",
    capabilities: ["Vital monitoring", "Abnormal detection", "Emergency alerts", "Doctor notifications", "Daily health score"],
  },
  chronic: {
    eyebrow: "Chronic Care",
    title: "Chronic disease management",
    description: "Diabetes, hypertension, heart disease, COPD, asthma, mental health, and more.",
    capabilities: ["Medication reminders", "Progress tracking", "Lifestyle coaching", "Nutrition & exercise plans", "AI monitoring"],
  },
  "home-care": {
    eyebrow: "Home Healthcare",
    title: "Care at home",
    description: "Doctor and nurse visits, therapies, home blood collection, equipment rental, elder care.",
    capabilities: ["Home visits", "PT / OT / speech therapy", "Medication delivery", "Equipment rental", "Rehabilitation"],
  },
  caregiver: {
    eyebrow: "Caregivers",
    title: "Caregiver platform",
    description: "Match qualified caregivers for daily care, medical assistance, transport, and companionship.",
    capabilities: ["Profiles & qualifications", "Scheduling", "Reviews", "Payment", "Language matching"],
  },
  insurance: {
    eyebrow: "Insurance",
    title: "Health insurance platform",
    description: "Verification, coverage checks, claims, pre-auth, digital cards, and reimbursement tracking.",
    capabilities: ["Coverage check", "Claims submission", "Pre-authorization", "Digital insurance card", "Co-pay estimation"],
  },
  trials: {
    eyebrow: "Clinical Trials",
    title: "Trial recruitment",
    description: "Publish studies, eligibility, consent, scheduling, monitoring, and AI patient matching.",
    capabilities: ["Study publishing", "Eligibility screening", "Consent forms", "AI matching", "Results tracking"],
  },
  education: {
    eyebrow: "Education",
    title: "Medical education",
    description: "Courses, CME, conferences, simulations, quizzes, and certificates.",
    capabilities: ["CME courses", "Training videos", "Case studies", "Quizzes", "Certificates"],
  },
  "health-coach": {
    eyebrow: "AI Health Coach",
    title: "Daily coaching",
    description: "Nutrition, exercise, sleep, stress, smoking cessation, weight, reminders, and goal tracking.",
    capabilities: ["Nutrition advice", "Exercise plans", "Sleep improvement", "Stress management", "Goal tracking"],
  },
  "public-health": {
    eyebrow: "Public Health",
    title: "Population dashboard",
    description: "Disease surveillance, vaccination stats, capacity, outbreaks, and government reporting.",
    capabilities: ["Disease surveillance", "Regional trends", "Hospital capacity", "Outbreak alerts", "Government reporting"],
  },
  research: {
    eyebrow: "Research",
    title: "Research collaboration",
    description: "Share datasets, publish papers, recruit participants, manage grants, and AI analysis.",
    capabilities: ["Dataset sharing", "Paper publishing", "Participant recruitment", "Grant management", "AI analysis"],
  },
  "api-platform": {
    eyebrow: "API Platform",
    title: "Developer integrations",
    description: "Auth, appointments, records (consent), labs, imaging, payments, webhooks, SDK, sandbox.",
    capabilities: ["API keys", "Sandbox", "Rate limits", "Webhooks", "SDK & docs"],
  },
};

export function makeModulePage(slug: string) {
  const m = MODULES[slug];
  if (!m) throw new Error(`Unknown module ${slug}`);
  return function Page() {
    return (
      <ModulePage
        eyebrow={m.eyebrow}
        title={m.title}
        description={m.description}
        capabilities={m.capabilities}
        hrefs={[
          { href: "/search", label: "Search" },
          { href: "/ai-consultant", label: "AI Consultant" },
          { href: "/subscriptions", label: "Subscriptions" },
        ]}
      />
    );
  };
}

export { MODULES };
