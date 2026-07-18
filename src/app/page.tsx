import Link from "next/link";
import { BlogCard } from "@/components/BlogCard";
import { PLATFORM_NAME, PLATFORM_TAGLINE } from "@/lib/modules";
import { prisma } from "@/lib/db";
import { getTopBlogPosts } from "@/lib/blog";
import { getSession } from "@/lib/auth";
import { groupModules, isPlatformOperator, platformModulesForRole } from "@/lib/module-access";
import { homePathForRole } from "@/lib/i18n";

export default async function HomePage() {
  const session = await getSession();
  const showPlatformModules = isPlatformOperator(session?.role);

  const [topBlogs, topDoctors, topHospitals, platformReviews] = await Promise.all([
    getTopBlogPosts(5),
    prisma.doctorProfile.findMany({
      where: { verified: true },
      include: { user: { select: { id: true, name: true, photoUrl: true } } },
      take: 4,
      orderBy: { consultationFee: "desc" },
    }),
    prisma.hospitalProfile.findMany({
      where: { verified: true },
      take: 4,
      orderBy: { totalBeds: "desc" },
    }),
    prisma.platformReview.findMany({
      include: { author: { select: { name: true, photoUrl: true } } },
      orderBy: { rating: "desc" },
      take: 6,
    }),
  ]);

  const platformGroups = showPlatformModules
    ? groupModules(platformModulesForRole(session!.role))
    : [];

  return (
    <>
      <section className="hero-plane">
        <div className="container-page hero-content">
          <p className="badge fade-up">{PLATFORM_NAME}</p>
          <h1 className="font-display hero-title fade-up-delay">
            Let&apos;s save the world.
          </h1>
          <p className="muted hero-sub fade-up-delay-2">{PLATFORM_TAGLINE}</p>
          <div className="hero-actions fade-up-delay-2">
            {session ? (
              <Link href={homePathForRole(session.role)} className="btn btn-primary">
                Go to dashboard
              </Link>
            ) : (
              <Link href="/register" className="btn btn-primary">
                Get started
              </Link>
            )}
            <Link href="/search" className="btn btn-ghost">
              Search care
            </Link>
          </div>
        </div>
      </section>

      {!session && (
        <section id="features" className="container-page section-block">
          <p className="badge">Care</p>
          <h2 className="font-display section-title">What you can do</h2>
          <p className="muted">
            Book appointments, consult clinicians, manage prescriptions, and track your health — after you sign in,
            your dashboard shows tools for your role.
          </p>
          <div className="module-grid">
            {[
              { href: "/register", label: "Create account" },
              { href: "/search", label: "Find care" },
              { href: "/blog", label: "Health articles" },
              { href: "/reviews", label: "Reviews" },
            ].map((m) => (
              <Link key={m.href} href={m.href} className="module-link">
                <div style={{ fontWeight: 600 }}>{m.label}</div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {showPlatformModules && (
        <section id="architecture" className="container-page section-block">
          <p className="badge">Architecture</p>
          <h2 className="font-display section-title">Platform modules</h2>
          <p className="muted">
            Administrator / developer directory — all modules with live APIs. Not shown to general users.
          </p>
          {platformGroups.map(({ group, items }) => (
            <div key={group} style={{ marginBottom: "1.5rem" }}>
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
      )}

      <section className="container-page section-block">
        <p className="badge">Service evaluations</p>
        <h2 className="font-display section-title">What people say</h2>
        <div className="review-grid">
          {platformReviews.map((r) => (
            <div key={r.id} className="panel">
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                {r.author.photoUrl && (
                  <img src={r.author.photoUrl} alt="" className="avatar-sm" />
                )}
                <strong>{r.author.name}</strong>
                <span className="badge">{"★".repeat(r.rating)}</span>
              </div>
              <p className="muted" style={{ marginBottom: 0 }}>
                {r.comment}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section id="top-rated" className="container-page section-block">
        <p className="badge">Top rated</p>
        <h2 className="font-display section-title">Doctors & hospitals</h2>
        <div className="two-col-grid">
          <div>
            <h3>Doctors</h3>
            <ul className="plain-list">
              {topDoctors.map((d) => (
                <li key={d.id}>
                  <Link href={`/profile/${d.user.id}`} className="profile-link">
                    {d.user.photoUrl && (
                      <img src={d.user.photoUrl} alt="" className="avatar-sm" />
                    )}
                    {d.user.name} — {d.specialty}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3>Hospitals</h3>
            <ul className="plain-list">
              {topHospitals.map((h) => (
                <li key={h.id}>
                  {h.name} · {h.totalBeds} beds
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="container-page section-block">
        <p className="badge">Popular blogs</p>
        <h2 className="font-display section-title">Top articles by views</h2>
        <div className="blog-grid">
          {topBlogs.map((post) => (
            <BlogCard key={post.id} post={post} />
          ))}
        </div>
        <div style={{ marginTop: "1rem" }}>
          <Link href="/blog" className="btn btn-ghost">
            View all blogs
          </Link>
        </div>
      </section>
    </>
  );
}
