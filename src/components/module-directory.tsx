import Link from "next/link";
import { NAV_MODULES } from "@/lib/modules";

export function ModuleDirectory({ title = "Platform modules" }: { title?: string }) {
  const groups = Array.from(new Set(NAV_MODULES.map((m) => m.group)));
  return (
    <section className="container-page" style={{ padding: "3rem 0 4rem" }}>
      <p className="badge">Directory</p>
      <h2 className="font-display section-title">{title}</h2>
      {groups.map((group) => (
        <div key={group} style={{ marginBottom: "1.75rem" }}>
          <h3 className="muted group-label">{group}</h3>
          <div className="module-grid">
            {NAV_MODULES.filter((m) => m.group === group).map((m) => (
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
