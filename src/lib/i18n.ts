import { Role } from "@prisma/client";

export const LOCALES = ["ja", "en", "ko", "zh"] as const;
export type Locale = (typeof LOCALES)[number];

const messages: Record<Locale, Record<string, string>> = {
  ja: {
    "home.welcome": "MedCareへようこそ",
    "home.tagline": "世界を救う医療プラットフォーム",
    "nav.features": "機能",
    "nav.reviews": "レビュー",
    "nav.topRated": "高評価",
    "nav.blogs": "ブログ",
    "nav.support": "サポート",
    "nav.signIn": "ログイン",
    "role.dashboard": "ダッシュボード",
    "role.quickLinks": "クイックリンク",
    "lang.label": "言語",
  },
  en: {
    "home.welcome": "Welcome to MedCare",
    "home.tagline": "Let's save the world — integrated healthcare",
    "nav.features": "Features",
    "nav.reviews": "Reviews",
    "nav.topRated": "Top rated",
    "nav.blogs": "Blogs",
    "nav.support": "Support",
    "nav.signIn": "Sign in",
    "role.dashboard": "Dashboard",
    "role.quickLinks": "Quick links",
    "lang.label": "Language",
  },
  ko: {
    "home.welcome": "MedCare에 오신 것을 환영합니다",
    "home.tagline": "세상을 구하는 통합 헬스케어",
    "nav.features": "기능",
    "nav.reviews": "리뷰",
    "nav.topRated": "인기",
    "nav.blogs": "블로그",
    "nav.support": "지원",
    "nav.signIn": "로그인",
    "role.dashboard": "대시보드",
    "role.quickLinks": "빠른 링크",
    "lang.label": "언어",
  },
  zh: {
    "home.welcome": "欢迎使用 MedCare",
    "home.tagline": "拯救世界的综合医疗平台",
    "nav.features": "功能",
    "nav.reviews": "评价",
    "nav.topRated": "高评分",
    "nav.blogs": "博客",
    "nav.support": "支持",
    "nav.signIn": "登录",
    "role.dashboard": "控制台",
    "role.quickLinks": "快捷链接",
    "lang.label": "语言",
  },
};

export function t(key: string, locale: Locale = "ja"): string {
  return messages[locale]?.[key] ?? messages.en[key] ?? key;
}

export function homePathForRole(role: Role | string): string {
  switch (role) {
    case Role.DEVELOPER:
      return "/developer";
    case Role.ADMIN:
      return "/admin";
    case Role.PATIENT:
      return "/patient";
    case Role.DOCTOR:
      return "/doctor";
    case Role.NURSE:
      return "/nurse";
    case Role.HOSPITAL:
      return "/hospital-home";
    case Role.COMPANY:
      return "/company";
    case Role.PHARMACY:
      return "/pharmacy";
    default:
      return "/patient";
  }
}

export type RoleLink = { href: string; label: string };

export function linksForRole(role: Role | string): RoleLink[] {
  const common: RoleLink[] = [
    { href: "/messages", label: "Messages" },
    { href: "/notifications", label: "Notifications" },
    { href: "/blog", label: "Blog" },
  ];

  switch (role) {
    case Role.DEVELOPER:
      return [
        { href: "/developer/archive", label: "Archive" },
        { href: "/developer/features", label: "Features" },
        { href: "/admin", label: "Admin" },
        ...common,
      ];
    case Role.ADMIN:
      return [
        { href: "/admin", label: "Admin console" },
        { href: "/support", label: "Support inbox" },
        { href: "/subscriptions", label: "Subscriptions" },
        ...common,
      ];
    case Role.PATIENT:
      return [
        { href: "/appointments", label: "Appointments" },
        { href: "/ai-consultant", label: "AI Consultant" },
        { href: "/telemedicine", label: "Telemedicine" },
        { href: "/marketplace", label: "Marketplace" },
        { href: "/pharmacy", label: "Pharmacy" },
        { href: "/billing", label: "Billing" },
        { href: "/community", label: "Community" },
        { href: "/search", label: "Search" },
        { href: "/subscriptions", label: "Subscriptions" },
        ...common,
      ];
    case Role.DOCTOR:
      return [
        { href: "/appointments", label: "Appointments" },
        { href: "/telemedicine", label: "Telemedicine" },
        { href: "/pharmacy", label: "Prescriptions" },
        { href: "/reviews", label: "Reviews" },
        { href: "/analytics", label: "Analytics" },
        ...common,
      ];
    case Role.NURSE:
      return [
        { href: "/appointments", label: "Schedule" },
        { href: "/telemedicine", label: "Telemedicine" },
        ...common,
      ];
    case Role.HOSPITAL:
      return [
        { href: "/hospital", label: "Hospital ops" },
        { href: "/analytics", label: "Analytics" },
        { href: "/appointments", label: "Appointments" },
        ...common,
      ];
    case Role.COMPANY:
      return [
        { href: "/corporate", label: "Corporate" },
        { href: "/billing", label: "Billing" },
        { href: "/subscriptions", label: "Subscriptions" },
        ...common,
      ];
    case Role.PHARMACY:
      return [
        { href: "/pharmacy", label: "Pharmacy desk" },
        { href: "/marketplace", label: "Marketplace" },
        ...common,
      ];
    default:
      return common;
  }
}
