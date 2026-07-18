export type NavModule = {
  href: string;
  label: string;
  group: string;
  featureKey?: string;
};

export const PLATFORM_NAME = "MedCare";
export const PLATFORM_TAGLINE = "Let's save the world — integrated healthcare for everyone.";

export const NAV_MODULES: NavModule[] = [
  { href: "/search", label: "Search", group: "Care", featureKey: "search" },
  { href: "/recommendations", label: "Recommendations", group: "Care", featureKey: "recommendations" },
  { href: "/ai-consultant", label: "AI Consultant", group: "Care", featureKey: "ai_consultant" },
  { href: "/verification", label: "Identity Verification", group: "Care", featureKey: "auth" },
  { href: "/security", label: "Security (2FA / Biometric)", group: "Care", featureKey: "auth" },
  { href: "/appointments", label: "Appointments", group: "Care", featureKey: "appointments" },
  { href: "/telemedicine", label: "Telemedicine", group: "Care", featureKey: "telemedicine" },
  { href: "/pharmacy", label: "Pharmacy", group: "Care", featureKey: "pharmacy" },
  { href: "/marketplace", label: "Marketplace", group: "Care", featureKey: "marketplace" },
  { href: "/hospital", label: "Hospital Dashboard", group: "Operations", featureKey: "hospital_dashboard" },
  { href: "/corporate", label: "Corporate Dashboard", group: "Operations", featureKey: "corporate_dashboard" },
  { href: "/analytics", label: "Analytics", group: "Operations", featureKey: "analytics" },
  { href: "/ehr", label: "Health Record", group: "Records", featureKey: "ehr" },
  { href: "/knowledge", label: "Knowledge Center", group: "Community", featureKey: "education" },
  { href: "/education", label: "Health Education", group: "Community", featureKey: "education" },
  { href: "/faq", label: "FAQs", group: "Community", featureKey: "education" },
  { href: "/blog", label: "Medical Blog", group: "Community", featureKey: "blog" },
  { href: "/community", label: "Community", group: "Community", featureKey: "community" },
  { href: "/reviews", label: "Reviews", group: "Community", featureKey: "reviews" },
  { href: "/messages", label: "Messages", group: "Comms", featureKey: "chat" },
  { href: "/chat", label: "Chat", group: "Comms", featureKey: "chat" },
  { href: "/notifications", label: "Notifications", group: "Comms", featureKey: "notifications" },
  { href: "/billing", label: "Billing", group: "Finance", featureKey: "billing" },
  { href: "/subscriptions", label: "Subscriptions", group: "Finance", featureKey: "subscriptions" },
  { href: "/privacy", label: "Privacy & Consent", group: "Admin", featureKey: "grc" },
  { href: "/grc", label: "GRC Compliance", group: "Admin", featureKey: "grc" },
  { href: "/architecture", label: "Architecture", group: "Developer", featureKey: "api_platform" },
  { href: "/ai-lab", label: "AI Lab", group: "Care", featureKey: "ai_consultant" },
  { href: "/admin", label: "Admin", group: "Admin", featureKey: "admin" },
  { href: "/developer/archive", label: "Archive", group: "Developer", featureKey: "archive" },
];
