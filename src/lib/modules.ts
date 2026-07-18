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
  { href: "/ai-consultant", label: "AI Consultant", group: "Care", featureKey: "ai_consultant" },
  { href: "/appointments", label: "Appointments", group: "Care", featureKey: "appointments" },
  { href: "/telemedicine", label: "Telemedicine", group: "Care", featureKey: "telemedicine" },
  { href: "/pharmacy", label: "Pharmacy", group: "Care", featureKey: "pharmacy" },
  { href: "/ehr", label: "Health Record", group: "Records", featureKey: "ehr" },
  { href: "/blog", label: "Medical Blog", group: "Community", featureKey: "blog" },
  { href: "/reviews", label: "Reviews", group: "Community", featureKey: "reviews" },
  { href: "/messages", label: "Messages", group: "Comms", featureKey: "chat" },
  { href: "/subscriptions", label: "Subscriptions", group: "Finance", featureKey: "subscriptions" },
  { href: "/admin", label: "Admin", group: "Admin", featureKey: "admin" },
  { href: "/developer/archive", label: "Archive", group: "Developer", featureKey: "archive" },
];
