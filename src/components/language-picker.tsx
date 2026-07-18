"use client";

import { LOCALES, type Locale, t } from "@/lib/i18n";

export function LanguagePicker({
  locale,
  onChange,
}: {
  locale: Locale;
  onChange: (locale: Locale) => void;
}) {
  return (
    <label className="lang-picker">
      <span className="muted">{t("lang.label", locale)}</span>
      <select
        className="input lang-select"
        value={locale}
        onChange={(e) => onChange(e.target.value as Locale)}
      >
        {LOCALES.map((l) => (
          <option key={l} value={l}>
            {l.toUpperCase()}
          </option>
        ))}
      </select>
    </label>
  );
}
