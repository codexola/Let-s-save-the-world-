import { Role } from "@prisma/client";

export const PERMISSIONS = {
  ARCHIVE_READ: "archive:read",
  ARCHIVE_WRITE: "archive:write",
  ARCHIVE_INIT: "archive:init",
  SUBSCRIPTIONS_MANAGE: "subscriptions:manage",
  SUBSCRIPTIONS_OVERRIDE: "subscriptions:override",
  FEATURES_TOGGLE: "features:toggle",
  USERS_MANAGE: "users:manage",
  DOCTORS_VERIFY: "doctors:verify",
  HOSPITALS_APPROVE: "hospitals:approve",
  PAYMENTS_MANAGE: "payments:manage",
  COUPONS_MANAGE: "coupons:manage",
  SUPPORT_ACCESS: "support:access",
  ANALYTICS_VIEW: "analytics:view",
  AUDIT_VIEW: "audit:view",
  ALL_FEATURES: "features:all",
} as const;

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const DEVELOPER_PERMISSIONS: PermissionKey[] = Object.values(PERMISSIONS);

export const ADMIN_PERMISSIONS: PermissionKey[] = Object.values(PERMISSIONS).filter(
  (p) =>
    p !== PERMISSIONS.ARCHIVE_READ &&
    p !== PERMISSIONS.ARCHIVE_WRITE &&
    p !== PERMISSIONS.ARCHIVE_INIT
);

export function defaultPermissionsForRole(role: Role): PermissionKey[] {
  switch (role) {
    case Role.DEVELOPER:
      return DEVELOPER_PERMISSIONS;
    case Role.ADMIN:
      return ADMIN_PERMISSIONS;
    default:
      return [];
  }
}

export function canAccessArchive(role: Role, keys: string[]): boolean {
  if (role === Role.DEVELOPER) return true;
  return (
    keys.includes(PERMISSIONS.ARCHIVE_INIT) ||
    keys.includes(PERMISSIONS.ARCHIVE_WRITE)
  );
}

export function hasPermission(
  role: Role,
  keys: string[],
  required: PermissionKey
): boolean {
  if (role === Role.DEVELOPER) return true;
  if (role === Role.ADMIN && required.startsWith("archive:")) return false;
  return keys.includes(required) || keys.includes(PERMISSIONS.ALL_FEATURES);
}

export const PLATFORM_FEATURES = [
  { key: "auth", name: "Authentication", category: "core", description: "Email, OAuth, 2FA, biometric login" },
  { key: "registration", name: "Registration", category: "core", description: "User registration with subscription codes" },
  { key: "search", name: "Search Engine", category: "core", description: "Faceted search: disease, symptoms, medication, providers, insurance, location, distance, price, rating, experience, language, availability, gender, department, treatments, online, home visit, emergency" },
  { key: "ai_consultant", name: "AI Medical Consultant", category: "ai", description: "Symptom analysis and triage" },
  { key: "recommendations", name: "Recommendation Engine", category: "ai", description: "Personalized provider ranking from profile, history, reviews, distance, AI scoring" },
  { key: "marketplace", name: "Medication Marketplace", category: "pharmacy", description: "Medicine profiles and price comparison" },
  { key: "telemedicine", name: "Telemedicine", category: "care", description: "Video consultations" },
  { key: "appointments", name: "Appointments", category: "care", description: "Book, cancel, reschedule" },
  { key: "pharmacy", name: "Pharmacy", category: "pharmacy", description: "Fulfillment and delivery" },
  { key: "hospital_dashboard", name: "Hospital Dashboard", category: "ops", description: "Beds, occupancy, staff" },
  { key: "corporate_dashboard", name: "Corporate Dashboard", category: "corporate", description: "Employee health programs" },
  { key: "blog", name: "Medical Blog", category: "content", description: "Articles and medical news" },
  { key: "community", name: "Community", category: "social", description: "Healthcare social network" },
  { key: "reviews", name: "Reviews", category: "social", description: "Verified appointment reviews" },
  { key: "chat", name: "Chat", category: "comms", description: "Encrypted messaging" },
  { key: "billing", name: "Billing", category: "finance", description: "Payments and invoices" },
  { key: "notifications", name: "Notifications", category: "comms", description: "Email, SMS, Push, LINE" },
  { key: "admin", name: "Admin Panel", category: "admin", description: "User and platform management" },
  { key: "analytics", name: "Analytics", category: "ops", description: "Patient, hospital, corporate analytics" },
  { key: "ems", name: "Emergency Medical Services", category: "emergency", description: "One-touch emergency and ambulance" },
  { key: "laboratory", name: "Laboratory", category: "diagnostics", description: "Lab orders and results" },
  { key: "imaging", name: "Medical Imaging", category: "diagnostics", description: "X-Ray, CT, MRI viewer" },
  { key: "ehr", name: "Electronic Health Record", category: "records", description: "Lifelong patient record" },
  { key: "wearables", name: "Wearable Integration", category: "monitoring", description: "Apple Health, Fitbit, etc." },
  { key: "rpm", name: "Remote Patient Monitoring", category: "monitoring", description: "AI vital monitoring" },
  { key: "chronic", name: "Chronic Disease Management", category: "care", description: "Diabetes, hypertension, etc." },
  { key: "vaccination", name: "Vaccination Management", category: "care", description: "History and reminders" },
  { key: "family", name: "Family Health", category: "care", description: "Manage dependents" },
  { key: "home_care", name: "Home Healthcare", category: "care", description: "Home visits and therapy" },
  { key: "caregiver", name: "Caregiver Platform", category: "care", description: "Caregiver matching" },
  { key: "insurance", name: "Health Insurance", category: "finance", description: "Claims and coverage" },
  { key: "clinical_trials", name: "Clinical Trials", category: "research", description: "Recruitment and matching" },
  { key: "pharmacy_delivery", name: "Pharmacy Delivery", category: "pharmacy", description: "Same-day delivery network" },
  { key: "bed_management", name: "Hospital Bed Management", category: "ops", description: "Real-time bed availability" },
  { key: "supply_marketplace", name: "Medical Supply Marketplace", category: "ops", description: "Hospital procurement" },
  { key: "cds", name: "AI Clinical Decision Support", category: "ai", description: "Differential diagnosis assistance" },
  { key: "public_health", name: "Public Health Dashboard", category: "ops", description: "Surveillance and outbreaks" },
  { key: "research", name: "Research Platform", category: "research", description: "Datasets and collaboration" },
  { key: "education", name: "Medical Education", category: "content", description: "CME and courses" },
  { key: "health_coach", name: "AI Health Coach", category: "ai", description: "Lifestyle coaching" },
  { key: "api_platform", name: "Healthcare API Platform", category: "developer", description: "SDK, keys, webhooks" },
  { key: "soc", name: "Security Operations Center", category: "security", description: "Threat monitoring" },
  { key: "grc", name: "Governance Risk Compliance", category: "security", description: "Consent and retention" },
  { key: "archive", name: "Archive System", category: "admin", description: "Developer archive init/modify" },
  { key: "subscriptions", name: "Subscriptions", category: "finance", description: "Individual and corporate plans" },
] as const;

export const SUBSCRIPTION_PLANS = {
  INDIVIDUAL: { plan: "INDIVIDUAL" as const, priceYen: 1000, label: "Individual", perEmployee: false },
  PREMIUM_FEATURES: { plan: "PREMIUM_FEATURES" as const, priceYen: 500, label: "Premium Features", perEmployee: false },
  CORPORATE: { plan: "CORPORATE" as const, priceYen: 400, label: "Corporate", perEmployee: true },
  CORPORATE_PREMIUM: { plan: "CORPORATE_PREMIUM" as const, priceYen: 200, label: "Corporate Premium", perEmployee: true },
} as const;
