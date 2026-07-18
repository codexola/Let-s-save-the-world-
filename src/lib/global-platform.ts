import { prisma } from "./db";
import { LOCALES, type Locale } from "./i18n";

export type CountryPack = {
  code: string;
  name: string;
  defaultLocale: Locale | string;
  defaultCurrency: string;
  timezone: string;
  taxRateBps: number;
  complianceFrameworks: string[];
  insurancePackKey: string;
  medicalGuidelines: Array<{ specialty: string; title: string; summary: string }>;
};

const SEED_COUNTRIES: CountryPack[] = [
  {
    code: "JP",
    name: "Japan",
    defaultLocale: "ja",
    defaultCurrency: "JPY",
    timezone: "Asia/Tokyo",
    taxRateBps: 1000,
    complianceFrameworks: ["APPI", "MHLW"],
    insurancePackKey: "jp_nhi",
    medicalGuidelines: [
      {
        specialty: "hypertension",
        title: "JSH blood pressure targets",
        summary: "Office BP <130/80 for most high-risk adults (regional JSH guidance).",
      },
      {
        specialty: "diabetes",
        title: "JDS glycemic targets",
        summary: "Individualize HbA1c; typically <7.0% for non-elderly adults.",
      },
    ],
  },
  {
    code: "US",
    name: "United States",
    defaultLocale: "en",
    defaultCurrency: "USD",
    timezone: "America/New_York",
    taxRateBps: 0,
    complianceFrameworks: ["HIPAA", "CMS"],
    insurancePackKey: "us_commercial",
    medicalGuidelines: [
      {
        specialty: "hypertension",
        title: "ACC/AHA BP guideline",
        summary: "Stage 1 HTN starts at 130/80; lifestyle + risk-based meds.",
      },
      {
        specialty: "diabetes",
        title: "ADA Standards of Care",
        summary: "A1C <7% for many nonpregnant adults; CGM encouraged.",
      },
    ],
  },
  {
    code: "KR",
    name: "South Korea",
    defaultLocale: "ko",
    defaultCurrency: "KRW",
    timezone: "Asia/Seoul",
    taxRateBps: 1000,
    complianceFrameworks: ["PIPA", "HIRA"],
    insurancePackKey: "kr_nhis",
    medicalGuidelines: [
      {
        specialty: "hypertension",
        title: "KSH hypertension guideline",
        summary: "Treat to <140/90 general; lower targets for selected patients.",
      },
    ],
  },
  {
    code: "CN",
    name: "China",
    defaultLocale: "zh",
    defaultCurrency: "CNY",
    timezone: "Asia/Shanghai",
    taxRateBps: 1300,
    complianceFrameworks: ["PIPL", "NHC"],
    insurancePackKey: "cn_basic_mi",
    medicalGuidelines: [
      {
        specialty: "hypertension",
        title: "Chinese hypertension guidelines",
        summary: "Clinic BP ≥140/90 defines hypertension; stepwise therapy.",
      },
    ],
  },
  {
    code: "GB",
    name: "United Kingdom",
    defaultLocale: "en",
    defaultCurrency: "GBP",
    timezone: "Europe/London",
    taxRateBps: 2000,
    complianceFrameworks: ["UK_GDPR", "NHS"],
    insurancePackKey: "uk_nhs",
    medicalGuidelines: [
      {
        specialty: "hypertension",
        title: "NICE NG136",
        summary: "Offer treatment based on stage and cardiovascular risk.",
      },
    ],
  },
];

const INSURANCE_PACKS: Record<
  string,
  { name: string; country: string; coverageNotes: string; copayPercent: number }
> = {
  jp_nhi: {
    name: "Japan National Health Insurance",
    country: "JP",
    coverageNotes: "Typical outpatient coinsurance 30% (age-adjusted).",
    copayPercent: 30,
  },
  us_commercial: {
    name: "US Commercial / Medicare mix",
    country: "US",
    coverageNotes: "Plan-dependent deductibles, prior auth for imaging/Rx.",
    copayPercent: 20,
  },
  kr_nhis: {
    name: "Korea NHIS",
    country: "KR",
    coverageNotes: "NHIS + optional private riders; HIRA fee schedules.",
    copayPercent: 30,
  },
  cn_basic_mi: {
    name: "China Basic Medical Insurance",
    country: "CN",
    coverageNotes: "Urban/rural MI with regional formularies.",
    copayPercent: 25,
  },
  uk_nhs: {
    name: "NHS + private top-up",
    country: "GB",
    coverageNotes: "NHS covers most care; prescriptions may have fixed charges.",
    copayPercent: 0,
  },
};

const FX: Array<{ fromCode: string; toCode: string; rate: number }> = [
  { fromCode: "JPY", toCode: "USD", rate: 0.0067 },
  { fromCode: "USD", toCode: "JPY", rate: 149.0 },
  { fromCode: "JPY", toCode: "KRW", rate: 9.1 },
  { fromCode: "KRW", toCode: "JPY", rate: 0.11 },
  { fromCode: "JPY", toCode: "CNY", rate: 0.048 },
  { fromCode: "CNY", toCode: "JPY", rate: 20.8 },
  { fromCode: "JPY", toCode: "GBP", rate: 0.0053 },
  { fromCode: "GBP", toCode: "JPY", rate: 188.0 },
  { fromCode: "USD", toCode: "EUR", rate: 0.92 },
  { fromCode: "EUR", toCode: "USD", rate: 1.09 },
];

export async function ensureGlobalSeed() {
  for (const c of SEED_COUNTRIES) {
    await prisma.countryConfig.upsert({
      where: { code: c.code },
      update: {
        name: c.name,
        defaultLocale: c.defaultLocale,
        defaultCurrency: c.defaultCurrency,
        timezone: c.timezone,
        taxRateBps: c.taxRateBps,
        complianceFrameworks: JSON.stringify(c.complianceFrameworks),
        insurancePackKey: c.insurancePackKey,
        medicalGuidelinesJson: JSON.stringify(c.medicalGuidelines),
        active: true,
      },
      create: {
        code: c.code,
        name: c.name,
        defaultLocale: c.defaultLocale,
        defaultCurrency: c.defaultCurrency,
        timezone: c.timezone,
        taxRateBps: c.taxRateBps,
        complianceFrameworks: JSON.stringify(c.complianceFrameworks),
        insurancePackKey: c.insurancePackKey,
        medicalGuidelinesJson: JSON.stringify(c.medicalGuidelines),
        active: true,
      },
    });
  }
  for (const r of FX) {
    await prisma.exchangeRate.upsert({
      where: { fromCode_toCode: { fromCode: r.fromCode, toCode: r.toCode } },
      update: { rate: r.rate, asOf: new Date() },
      create: { ...r, asOf: new Date() },
    });
  }
}

export function formatMoney(amountMinorOrYen: number, currency: string, locale: string) {
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency }).format(
      currency === "JPY" || currency === "KRW" ? amountMinorOrYen : amountMinorOrYen / 100
    );
  } catch {
    return `${amountMinorOrYen} ${currency}`;
  }
}

export function formatInTimezone(date: Date, timeZone: string, locale: string) {
  try {
    return new Intl.DateTimeFormat(locale, {
      timeZone,
      dateStyle: "medium",
      timeStyle: "short",
    }).format(date);
  } catch {
    return date.toISOString();
  }
}

export function computeLocalTax(amountYen: number, taxRateBps: number) {
  const tax = Math.round((amountYen * taxRateBps) / 10000);
  return { net: amountYen, tax, gross: amountYen + tax, taxRateBps };
}

export async function convertCurrency(amount: number, fromCode: string, toCode: string) {
  if (fromCode === toCode) return { amount, rate: 1, fromCode, toCode };
  const row = await prisma.exchangeRate.findUnique({
    where: { fromCode_toCode: { fromCode, toCode } },
  });
  if (!row) throw new Error("Rate not found");
  return { amount: Math.round(amount * row.rate * 100) / 100, rate: row.rate, fromCode, toCode };
}

export async function globalDashboard(userId?: string) {
  await ensureGlobalSeed();
  const countries = await prisma.countryConfig.findMany({ where: { active: true }, orderBy: { code: "asc" } });
  const rates = await prisma.exchangeRate.findMany({ orderBy: { fromCode: "asc" } });
  let preferences = null;
  if (userId) {
    preferences = await prisma.user.findUnique({
      where: { id: userId },
      select: { locale: true, countryCode: true, timezone: true, currency: true },
    });
  }

  const mapped = countries.map((c) => ({
    ...c,
    complianceFrameworks: JSON.parse(c.complianceFrameworks) as string[],
    medicalGuidelines: c.medicalGuidelinesJson
      ? (JSON.parse(c.medicalGuidelinesJson) as CountryPack["medicalGuidelines"])
      : [],
    insurance: INSURANCE_PACKS[c.insurancePackKey] || null,
    sampleTax: computeLocalTax(10000, c.taxRateBps),
    localizedNow: formatInTimezone(new Date(), c.timezone, c.defaultLocale),
    localizedPrice: formatMoney(10000, c.defaultCurrency, c.defaultLocale),
  }));

  return {
    locales: LOCALES,
    countries: mapped,
    exchangeRates: rates,
    preferences,
    localization: {
      supported: LOCALES,
      dateTime: "Intl with per-country timezone",
      currency: "Intl NumberFormat + FX table",
      forms: "Country packs drive locale, currency, tax, insurance, guidelines",
    },
  };
}

export async function setUserRegion(
  userId: string,
  opts: { locale?: string; countryCode?: string; timezone?: string; currency?: string }
) {
  const country = opts.countryCode
    ? await prisma.countryConfig.findUnique({ where: { code: opts.countryCode } })
    : null;
  return prisma.user.update({
    where: { id: userId },
    data: {
      locale: opts.locale || country?.defaultLocale,
      countryCode: opts.countryCode || undefined,
      timezone: opts.timezone || country?.timezone,
      currency: opts.currency || country?.defaultCurrency,
    },
    select: { locale: true, countryCode: true, timezone: true, currency: true },
  });
}

export function insurancePack(key: string) {
  return INSURANCE_PACKS[key] || null;
}
