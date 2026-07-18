export type NavModule = {
  href: string;
  label: string;
  group: string;
  featureKey?: string;
  /** Override default group-based access (see module-access.ts) */
  access?: "all" | "admin" | "developer";
};

export const PLATFORM_NAME = "MedCare";
export const PLATFORM_TAGLINE = "Let's save the world — integrated healthcare for everyone.";

export const NAV_MODULES: NavModule[] = [
  { href: "/search", label: "Search", group: "Care", featureKey: "search" },
  { href: "/recommendations", label: "Recommendations", group: "Care", featureKey: "recommendations" },
  { href: "/ai-consultant", label: "AI Consultant", group: "Care", featureKey: "ai_consultant" },
  { href: "/verification", label: "Identity Verification", group: "Care", featureKey: "auth" },
  { href: "/security", label: "Security (2FA / Biometric)", group: "Care", featureKey: "auth" },
  { href: "/ems", label: "Emergency EMS", group: "Care", featureKey: "ems" },
  { href: "/laboratory", label: "Laboratory", group: "Care", featureKey: "laboratory" },
  { href: "/imaging", label: "Medical Imaging", group: "Care", featureKey: "imaging" },
  { href: "/wearables", label: "Wearables", group: "Care", featureKey: "wearables" },
  { href: "/rpm", label: "Remote Monitoring", group: "Care", featureKey: "rpm" },
  { href: "/chronic", label: "Chronic Disease", group: "Care", featureKey: "chronic" },
  { href: "/vaccination", label: "Vaccinations", group: "Care", featureKey: "vaccination" },
  { href: "/family", label: "Family Health", group: "Care", featureKey: "family" },
  { href: "/home-care", label: "Home Healthcare", group: "Care", featureKey: "home_care" },
  { href: "/caregiver", label: "Caregivers", group: "Care", featureKey: "caregiver" },
  { href: "/insurance", label: "Insurance", group: "Finance", featureKey: "insurance" },
  { href: "/trials", label: "Clinical Trials", group: "Care", featureKey: "clinical_trials" },
  { href: "/appointments", label: "Appointments", group: "Care", featureKey: "appointments" },
  { href: "/telemedicine", label: "Telemedicine", group: "Care", featureKey: "telemedicine" },
  { href: "/pharmacy", label: "Pharmacy", group: "Care", featureKey: "pharmacy" },
  { href: "/pharmacy-delivery", label: "Pharmacy Delivery", group: "Care", featureKey: "pharmacy_delivery" },
  { href: "/marketplace", label: "Marketplace", group: "Care", featureKey: "marketplace" },
  { href: "/supply", label: "Supply Marketplace", group: "Operations", featureKey: "supply_marketplace" },
  { href: "/hospital", label: "Hospital Dashboard", group: "Operations", featureKey: "hospital_dashboard" },
  { href: "/beds", label: "Bed Management", group: "Operations", featureKey: "bed_management" },
  { href: "/corporate", label: "Corporate Dashboard", group: "Operations", featureKey: "corporate_dashboard" },
  { href: "/analytics", label: "Analytics", group: "Operations", featureKey: "analytics" },
  { href: "/executive", label: "Executive AI Analytics", group: "Operations", featureKey: "analytics" },
  { href: "/ehr", label: "Health Record", group: "Records", featureKey: "ehr" },
  { href: "/cds", label: "AI Decision Support", group: "Care", featureKey: "cds" },
  { href: "/health-coach", label: "AI Health Coach", group: "Care", featureKey: "health_coach" },
  { href: "/public-health", label: "Public Health", group: "Operations", featureKey: "public_health" },
  { href: "/research", label: "Research Platform", group: "Community", featureKey: "research" },
  { href: "/knowledge", label: "Knowledge Center", group: "Community", featureKey: "education" },
  { href: "/education", label: "Medical Education", group: "Community", featureKey: "education" },
  { href: "/faq", label: "FAQs", group: "Community", featureKey: "education" },
  { href: "/blog", label: "Medical Blog", group: "Community", featureKey: "blog" },
  { href: "/community", label: "Healthcare Social", group: "Community", featureKey: "community" },
  { href: "/reviews", label: "Reviews", group: "Community", featureKey: "reviews" },
  { href: "/messages", label: "Messages", group: "Comms", featureKey: "chat" },
  { href: "/chat", label: "Chat", group: "Comms", featureKey: "chat" },
  { href: "/notifications", label: "Notifications", group: "Comms", featureKey: "notifications" },
  { href: "/billing", label: "Billing", group: "Finance", featureKey: "billing" },
  { href: "/subscriptions", label: "Subscriptions", group: "Finance", featureKey: "subscriptions" },
  { href: "/privacy", label: "Privacy & Consent", group: "Records", featureKey: "grc", access: "all" },
  { href: "/grc", label: "GRC Compliance", group: "Admin", featureKey: "grc", access: "admin" },
  { href: "/soc", label: "Security Operations", group: "Admin", featureKey: "soc", access: "admin" },
  { href: "/dr", label: "Disaster Recovery", group: "Admin", featureKey: "dr_bcp", access: "admin" },
  { href: "/enterprise", label: "Enterprise Admin", group: "Admin", featureKey: "enterprise", access: "admin" },
  { href: "/expansion", label: "Future Expansion", group: "Developer", featureKey: "expansion", access: "admin" },
  { href: "/global", label: "Global Platform", group: "Admin", featureKey: "global_platform", access: "admin" },
  { href: "/developers", label: "API Platform", group: "Developer", featureKey: "api_platform", access: "admin" },
  { href: "/architecture", label: "Architecture", group: "Developer", featureKey: "api_platform", access: "admin" },
  { href: "/ai-lab", label: "AI Lab", group: "Care", featureKey: "ai_consultant" },
  { href: "/admin", label: "Admin", group: "Admin", featureKey: "admin", access: "admin" },
  { href: "/developer/archive", label: "Archive", group: "Developer", featureKey: "archive", access: "developer" },
];
