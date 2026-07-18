"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { LanguagePicker } from "./language-picker";
import { linksForRole, t, type Locale, homePathForRole } from "@/lib/i18n";
import { PLATFORM_TAGLINE } from "@/lib/modules";

type User = {
  id: string;
  name: string;
  role: string;
  photoUrl?: string | null;
  locale?: string;
};

export function RoleHomeShell({
  role,
  title,
  children,
}: {
  role: string;
  title: string;
  children?: React.ReactNode;
}) {
  const [user, setUser] = useState<User | null>(null);
  const [locale, setLocale] = useState<Locale>("ja");

  useEffect(() => {
    fetch("/api/auth")
      .then((r) => r.json())
      .then((d) => {
        if (d.user) {
          setUser(d.user);
          setLocale((d.user.locale as Locale) || "ja");
        }
      });
  }, []);

  async function handleLocaleChange(next: Locale) {
    setLocale(next);
    await fetch("/api/profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "set_locale", locale: next }),
    });
  }

  const links = linksForRole(role);

  return (
    <main className="container-page page-main">
      <div className="page-header">
        <div>
          <p className="badge">{role}</p>
          <h1 className="font-display page-title">{title}</h1>
          <p className="muted page-desc">{PLATFORM_TAGLINE}</p>
        </div>
        <LanguagePicker locale={locale} onChange={handleLocaleChange} />
      </div>

      {user && (
        <div className="panel role-welcome">
          {user.photoUrl && <img src={user.photoUrl} alt="" className="avatar-md" />}
          <div>
            <strong>{user.name}</strong>
            <p className="muted" style={{ margin: "0.25rem 0 0" }}>
              {t("role.dashboard", locale)} · {homePathForRole(user.role)}
            </p>
          </div>
        </div>
      )}

      <section style={{ marginTop: "1.25rem" }}>
        <h2 className="section-title">{t("role.quickLinks", locale)}</h2>
        <div className="module-grid">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="module-link">
              {l.label}
            </Link>
          ))}
        </div>
      </section>

      {children}
    </main>
  );
}
