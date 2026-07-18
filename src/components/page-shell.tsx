import type { ReactNode } from "react";

export function PageShell({
  eyebrow,
  title,
  description,
  actions,
  children,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <main className="container-page page-main">
      <div className="page-header">
        <div>
          {eyebrow && <p className="badge fade-up">{eyebrow}</p>}
          <h1 className="font-display page-title fade-up-delay">{title}</h1>
          {description && <p className="muted fade-up-delay-2 page-desc">{description}</p>}
        </div>
        {actions}
      </div>
      {children}
    </main>
  );
}
