import type { ReactNode } from "react";
import Link from "next/link";

export function ModulePage({
  eyebrow,
  title,
  description,
  capabilities,
  hrefs = [],
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  capabilities: string[];
  hrefs?: { href: string; label: string }[];
  children?: ReactNode;
}) {
  return (
    <main className="container-page page-main">
      <p className="badge">{eyebrow}</p>
      <h1 className="font-display page-title">{title}</h1>
      <p className="muted page-desc">{description}</p>
      <div className="panel">
        <h2 style={{ marginTop: 0 }}>Capabilities</h2>
        <ul style={{ margin: 0, paddingLeft: "1.1rem" }}>
          {capabilities.map((c) => (
            <li key={c} style={{ marginBottom: "0.35rem" }}>
              {c}
            </li>
          ))}
        </ul>
      </div>
      {hrefs.length > 0 && (
        <div className="link-row">
          {hrefs.map((h) => (
            <Link key={h.href} href={h.href} className="btn btn-ghost">
              {h.label}
            </Link>
          ))}
        </div>
      )}
      {children}
    </main>
  );
}
