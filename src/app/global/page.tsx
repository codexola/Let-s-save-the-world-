"use client";

import { FormEvent, useEffect, useState } from "react";
import { PageShell } from "@/components/page-shell";

type Country = {
  code: string;
  name: string;
  defaultLocale: string;
  defaultCurrency: string;
  timezone: string;
  taxRateBps: number;
  complianceFrameworks: string[];
  medicalGuidelines: Array<{ specialty: string; title: string; summary: string }>;
  insurance: { name: string; coverageNotes: string; copayPercent: number } | null;
  sampleTax: { net: number; tax: number; gross: number };
  localizedNow: string;
  localizedPrice: string;
};

export default function GlobalPage() {
  const [countries, setCountries] = useState<Country[]>([]);
  const [locales, setLocales] = useState<string[]>([]);
  const [rates, setRates] = useState<Array<{ fromCode: string; toCode: string; rate: number }>>([]);
  const [preferences, setPreferences] = useState<{
    locale: string;
    countryCode: string;
    timezone: string;
    currency: string;
  } | null>(null);
  const [fxResult, setFxResult] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function load() {
    const res = await fetch("/api/global");
    const d = await res.json();
    if (!res.ok) {
      setError(d.error || "Sign in required");
      return;
    }
    setCountries(d.countries || []);
    setLocales(d.locales || []);
    setRates(d.exchangeRates || []);
    setPreferences(d.preferences || null);
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <PageShell
      eyebrow="Localization"
      title="Global platform support"
      description="Multi-language · multi-country · multi-currency · regional compliance · country insurance · time zones · local tax · localization · regional medical guidelines."
    >
      {error && <p className="error-text">{error}</p>}
      {message && <p className="muted">{message}</p>}

      {preferences && (
        <div className="panel" style={{ marginBottom: "1rem" }}>
          <h3 style={{ marginTop: 0 }}>Your region</h3>
          <p>
            {preferences.countryCode} · {preferences.locale} · {preferences.timezone} · {preferences.currency}
          </p>
          <p className="muted">Languages: {locales.join(", ")}</p>
        </div>
      )}

      <form
        className="panel form-narrow"
        style={{ marginBottom: "1rem" }}
        onSubmit={async (e: FormEvent) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget as HTMLFormElement);
          const res = await fetch("/api/global", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "set_region", countryCode: fd.get("countryCode") }),
          });
          const d = await res.json();
          if (!res.ok) setError(d.error);
          else {
            setMessage("Region preferences updated");
            setPreferences(d.preferences);
            load();
          }
        }}
      >
        <h3 style={{ marginTop: 0 }}>Set country / localization</h3>
        <select className="input" name="countryCode" defaultValue={preferences?.countryCode || "JP"}>
          {countries.map((c) => (
            <option key={c.code} value={c.code}>
              {c.name} ({c.code})
            </option>
          ))}
        </select>
        <button className="btn btn-primary form-submit" type="submit">
          Apply country pack
        </button>
      </form>

      <form
        className="panel form-narrow"
        style={{ marginBottom: "1rem" }}
        onSubmit={async (e: FormEvent) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget as HTMLFormElement);
          const res = await fetch("/api/global", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "convert",
              amount: Number(fd.get("amount")),
              fromCode: fd.get("fromCode"),
              toCode: fd.get("toCode"),
            }),
          });
          const d = await res.json();
          if (!res.ok) setError(d.error);
          else setFxResult(`${d.amount} ${d.toCode} (rate ${d.rate})`);
        }}
      >
        <h3 style={{ marginTop: 0 }}>Multi-currency convert</h3>
        <input className="input" name="amount" type="number" defaultValue={10000} />
        <select className="input" name="fromCode" defaultValue="JPY">
          {["JPY", "USD", "KRW", "CNY", "GBP", "EUR"].map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select className="input" name="toCode" defaultValue="USD">
          {["USD", "JPY", "KRW", "CNY", "GBP", "EUR"].map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <button className="btn form-submit" type="submit">
          Convert
        </button>
        {fxResult && <p className="muted">{fxResult}</p>}
      </form>

      <h3>Countries & regional packs</h3>
      <div className="feature-grid">
        {countries.map((c) => (
          <div key={c.code} className="panel">
            <p className="badge">{c.code}</p>
            <h3 style={{ marginTop: 0 }}>{c.name}</h3>
            <p className="muted">
              {c.defaultLocale} · {c.defaultCurrency} · {c.timezone}
            </p>
            <p>Local time: {c.localizedNow}</p>
            <p>Sample price: {c.localizedPrice}</p>
            <p>
              Tax on ¥10,000: ¥{c.sampleTax.tax} (gross ¥{c.sampleTax.gross}) · {c.taxRateBps / 100}%
            </p>
            <p className="muted">Compliance: {c.complianceFrameworks.join(", ")}</p>
            {c.insurance && (
              <p>
                Insurance: {c.insurance.name} · copay ~{c.insurance.copayPercent}% — {c.insurance.coverageNotes}
              </p>
            )}
            <h4>Regional guidelines</h4>
            {c.medicalGuidelines.map((g) => (
              <p key={g.title} className="muted">
                <strong>{g.title}</strong> ({g.specialty}): {g.summary}
              </p>
            ))}
          </div>
        ))}
      </div>

      <h3>Exchange rates</h3>
      <div className="panel">
        {rates.map((r) => (
          <span key={`${r.fromCode}-${r.toCode}`} className="muted" style={{ marginRight: "1rem" }}>
            {r.fromCode}→{r.toCode}: {r.rate}
          </span>
        ))}
      </div>
    </PageShell>
  );
}
