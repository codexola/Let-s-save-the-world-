"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { PLATFORM_NAME } from "@/lib/modules";
import { homePathForRole } from "@/lib/i18n";

type User = {
  id: string;
  email: string;
  name: string;
  role: string;
  photoUrl?: string | null;
};

export function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    fetch("/api/auth")
      .then((r) => r.json())
      .then((d) => setUser(d.user))
      .catch(() => setUser(null));
  }, [pathname]);

  async function logout() {
    await fetch("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "logout" }),
    });
    setUser(null);
    router.push("/");
    router.refresh();
  }

  return (
    <header className="site-header">
      <div className="container-page header-inner">
        <Link href="/" className="font-display brand">
          {PLATFORM_NAME}
          <span className="brand-dot">.</span>
        </Link>
        <nav className="header-nav">
          <Link href="/#features" className="muted">
            Features
          </Link>
          <Link href="/reviews" className="muted">
            Reviews
          </Link>
          <Link href="/#top-rated" className="muted">
            Top rated
          </Link>
          <Link href="/blog" className="muted">
            Blogs
          </Link>
          <Link href="/support" className="muted">
            Support
          </Link>
          {user ? (
            <>
              <Link href={homePathForRole(user.role)} className="muted">
                Dashboard
              </Link>
              {user.photoUrl ? (
                <img src={user.photoUrl} alt="" className="avatar-sm" />
              ) : null}
              <span className="badge">{user.role}</span>
              <button className="btn btn-ghost" onClick={logout} type="button">
                Sign out
              </button>
            </>
          ) : (
            <Link href="/login" className="btn btn-primary">
              Sign in
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
