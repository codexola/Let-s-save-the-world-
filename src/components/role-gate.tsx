"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { homePathForRole } from "@/lib/i18n";

/** Client gate for admin / developer-only pages. */
export function RoleGate({
  allow,
  children,
  title = "Restricted",
}: {
  allow: string[];
  children: React.ReactNode;
  title?: string;
}) {
  const [state, setState] = useState<"loading" | "ok" | "denied">("loading");
  const [home, setHome] = useState("/");

  useEffect(() => {
    fetch("/api/auth")
      .then((r) => r.json())
      .then((d) => {
        const role = d.user?.role as string | undefined;
        if (role && allow.includes(role)) {
          setState("ok");
        } else {
          setHome(role ? homePathForRole(role) : "/login");
          setState("denied");
        }
      })
      .catch(() => setState("denied"));
  }, [allow]);

  if (state === "loading") {
    return (
      <main className="container-page page-main">
        <p className="muted">Checking access…</p>
      </main>
    );
  }

  if (state === "denied") {
    return (
      <main className="container-page page-main">
        <p className="badge">Access</p>
        <h1 className="font-display page-title">{title}</h1>
        <p className="muted">This area is limited to administrators and developers.</p>
        <Link href={home} className="btn btn-primary">
          Back to your dashboard
        </Link>
      </main>
    );
  }

  return <>{children}</>;
}
