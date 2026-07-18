import type { ProfileFieldDef } from "@/components/profile-form";

export const personalProfileFields: ProfileFieldDef[] = [
  { key: "name", label: "Name", type: "string" },
  { key: "email", label: "Email", type: "string", readOnly: true },
  { key: "phone", label: "Phone", type: "string" },
  { key: "photoUrl", label: "Photo URL", type: "string" },
  { key: "bio", label: "Bio", type: "textarea" },
  {
    key: "gender",
    label: "Gender",
    type: "string",
    placeholder: "female | male | other | unspecified",
  },
  { key: "dateOfBirth", label: "Date of birth (YYYY-MM-DD)", type: "string" },
];

export const patientMedicalFields: ProfileFieldDef[] = [
  { key: "bloodType", label: "Blood type", type: "string" },
  { key: "allergies", label: "Allergies", type: "textarea" },
  { key: "medications", label: "Current medications", type: "textarea" },
  { key: "medicalHistory", label: "Medical history", type: "textarea" },
  { key: "insuranceInfo", label: "Insurance info", type: "textarea" },
  { key: "incomeBracket", label: "Income bracket (low|middle|high)", type: "string" },
  { key: "preferredLanguage", label: "Preferred language", type: "string" },
  { key: "familyDoctor", label: "Family doctor", type: "string" },
  { key: "emergencyContact", label: "Emergency contact", type: "textarea" },
];

export const patientFavoritesFields: ProfileFieldDef[] = [
  {
    key: "favoriteHospitals",
    label: "Favorite hospitals (comma-separated)",
    type: "textarea",
    placeholder: "Tokyo Central Hospital, St. Luke's",
  },
  {
    key: "favoriteDoctors",
    label: "Favorite doctors (comma-separated)",
    type: "textarea",
    placeholder: "Dr. Kenji Sato, Dr. Yuki Yamada",
  },
];

export const patientPaymentFields: ProfileFieldDef[] = [
  {
    key: "paymentMethods",
    label: "Payment methods (JSON or description)",
    type: "textarea",
    placeholder: '[{"type":"card","last4":"4242"}]',
  },
];

export const doctorProfileFields: ProfileFieldDef[] = [
  { key: "licenseNumber", label: "License number", type: "string" },
  { key: "nationalRegNumber", label: "National registration", type: "string" },
  { key: "university", label: "University", type: "string" },
  { key: "graduationYear", label: "Graduation year", type: "number" },
  { key: "boardCertifications", label: "Board certifications", type: "textarea" },
  { key: "specialty", label: "Specialty", type: "string" },
  { key: "subspecialty", label: "Subspecialty", type: "string" },
  { key: "clinicalExperience", label: "Clinical experience", type: "textarea" },
  { key: "yearsExperience", label: "Years of experience", type: "number" },
  { key: "treatmentMethods", label: "Treatment methods", type: "textarea" },
  { key: "successRate", label: "Treatment success rate (%)", type: "number" },
  { key: "hospitalAffiliation", label: "Hospital affiliation", type: "string" },
  { key: "languages", label: "Languages", type: "string" },
  { key: "awards", label: "Awards", type: "textarea" },
  { key: "publications", label: "Publications", type: "textarea" },
  { key: "research", label: "Research", type: "textarea" },
  { key: "consultationFee", label: "Consultation fee (¥)", type: "number" },
  { key: "schedule", label: "Schedule", type: "textarea" },
  { key: "onlineAvailable", label: "Online available", type: "boolean" },
  { key: "offlineAvailable", label: "Offline available", type: "boolean" },
  { key: "licenseVerified", label: "License verified", type: "boolean", readOnly: true },
  { key: "govDbVerified", label: "Gov. DB verified", type: "boolean", readOnly: true },
  { key: "hospitalConfirmed", label: "Hospital confirmed", type: "boolean", readOnly: true },
  { key: "verified", label: "Verified", type: "boolean", readOnly: true },
];

export const nurseExtraFields: ProfileFieldDef[] = [
  { key: "certifications", label: "Certifications", type: "textarea" },
  { key: "clinicalSpecialties", label: "Clinical specialties", type: "textarea" },
  { key: "shiftAvailability", label: "Shift availability", type: "textarea" },
  { key: "homeVisitAvailable", label: "Home visit available", type: "boolean" },
];

export const nurseProfileFields: ProfileFieldDef[] = [
  ...doctorProfileFields.filter((f) => f.key !== "verified"),
  ...nurseExtraFields,
  { key: "verified", label: "Verified", type: "boolean", readOnly: true },
];

export const hospitalProfileFields: ProfileFieldDef[] = [
  { key: "name", label: "Hospital name", type: "string" },
  { key: "departments", label: "Departments", type: "textarea" },
  { key: "equipment", label: "Equipment", type: "textarea" },
  { key: "operatingHours", label: "Operating hours", type: "string" },
  { key: "emergencyAvailable", label: "Emergency available", type: "boolean" },
  { key: "icuBeds", label: "ICU beds", type: "number" },
  { key: "totalBeds", label: "Total beds", type: "number" },
  { key: "operatingRooms", label: "Operating rooms", type: "number" },
  { key: "parking", label: "Parking", type: "boolean" },
  { key: "acceptedInsurance", label: "Accepted insurance", type: "textarea" },
  { key: "languages", label: "Languages", type: "string" },
  { key: "pharmacyOnSite", label: "Pharmacy on site", type: "boolean" },
  { key: "ambulance", label: "Ambulance", type: "boolean" },
  { key: "accreditation", label: "Accreditation", type: "string" },
  { key: "businessRegistration", label: "Business registration", type: "string" },
  { key: "medicalInstitutionReg", label: "Medical institution registration", type: "string" },
  { key: "treatmentMethods", label: "Treatment methods", type: "textarea" },
  { key: "address", label: "Address", type: "string" },
  { key: "latitude", label: "Latitude", type: "number" },
  { key: "longitude", label: "Longitude", type: "number" },
  { key: "businessRegVerified", label: "Business reg. verified", type: "boolean", readOnly: true },
  {
    key: "medicalInstitutionVerified",
    label: "Medical institution verified",
    type: "boolean",
    readOnly: true,
  },
  { key: "doctorsList", label: "Doctors list (names, comma-separated)", type: "textarea" },
  { key: "nursesList", label: "Nurses list (names, comma-separated)", type: "textarea" },
  { key: "verified", label: "Verified", type: "boolean", readOnly: true },
];

export const pharmacyProfileFields: ProfileFieldDef[] = [
  { key: "name", label: "Pharmacy name", type: "string" },
  { key: "deliveryAvailable", label: "Delivery available", type: "boolean" },
  { key: "pickupAvailable", label: "Pickup available", type: "boolean" },
  { key: "prescriptionSupport", label: "Prescription support", type: "boolean" },
  { key: "discounts", label: "Discounts", type: "textarea" },
];

export const companyProfileFields: ProfileFieldDef[] = [
  { key: "name", label: "Company name", type: "string" },
  { key: "taxId", label: "Tax ID", type: "string" },
  { key: "businessRegistration", label: "Business registration", type: "string" },
  { key: "businessRegVerified", label: "Business reg. verified", type: "boolean", readOnly: true },
  { key: "taxIdVerified", label: "Tax ID verified", type: "boolean", readOnly: true },
  { key: "employeeCount", label: "Employee count", type: "number" },
  { key: "employeesJson", label: "Employees (JSON)", type: "textarea" },
  { key: "healthCheckSchedule", label: "Health check schedule", type: "textarea" },
  { key: "medicalReports", label: "Medical reports", type: "textarea" },
  { key: "healthCampaigns", label: "Health campaigns", type: "textarea" },
  { key: "vaccinationPrograms", label: "Vaccination programs", type: "textarea" },
  { key: "insuranceSupport", label: "Insurance support", type: "textarea" },
  { key: "verified", label: "Verified", type: "boolean", readOnly: true },
];
