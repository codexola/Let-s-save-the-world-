"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { groupModules, isPlatformOperator, platformModulesForRole } from "@/lib/module-access";
import type { NavModule } from "@/lib/modules";

export function ModuleDirectory({
  title = "Platform modules",
  forceRole,
}: {
  title?: string;
  /** When set (e.g. from a known admin/developer page), skip auth fetch */
  forceRole?: string;
}) {
  const [role, setRole] = useState<string | null>(forceRole ?? null);
  const [ready, setReady] = useState(Boolean(forceRole));

  useEffect(() => {
    if (forceRole) return;
    fetch("/api/auth")
      .then((r) => r.json())
      .then((d) => {
        setRole(d.user?.role || null);
        setReady(true);
      })
      .catch(() => {
        setRole(null);
        setReady(true);
      });
  }, [forceRole]);

  if (!ready) return null;
  if (!isPlatformOperator(role)) return null;

  const modules: NavModule[] = platformModulesForRole(role);
  const grouped = groupModules(modules);
  if (grouped.length === 0) return null;

  return (
    <section className="container-page" style={{ padding: "2rem 0 3rem" }}>
      <p className="badge">Directory</p>
      <h2 className="font-display section-title">{title}</h2>
      <p className="muted">Visible to administrators and developers only.</p>
      {grouped.map(({ group, items }) => (
        <div key={group} style={{ marginBottom: "1.75rem" }}>
          <h3 className="muted group-label">{group}</h3>
          <div className="module-grid">
            {items.map((m) => (
              <Link key={m.href} href={m.href} className="module-link">
                <div style={{ fontWeight: 600 }}>{m.label}</div>
              </Link>
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}
