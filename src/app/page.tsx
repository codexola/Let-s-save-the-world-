import Link from "next/link";
import { BlogCard } from "@/components/BlogCard";
import { PLATFORM_NAME, PLATFORM_TAGLINE } from "@/lib/modules";
import { prisma } from "@/lib/db";
import { getTopBlogPosts } from "@/lib/blog";

const ARCHITECTURE_MODULES = [
  { href: "/search", label: "Search", group: "Care" },
  { href: "/ai-consultant", label: "AI Consultant", group: "Care" },
  { href: "/appointments", label: "Appointments", group: "Care" },
  { href: "/telemedicine", label: "Telemedicine", group: "Care" },
  { href: "/pharmacy", label: "Pharmacy", group: "Care" },
  { href: "/marketplace", label: "Marketplace", group: "Care" },
  { href: "/hospital", label: "Hospital Dashboard", group: "Operations" },
  { href: "/corporate", label: "Corporate Dashboard", group: "Operations" },
  { href: "/analytics", label: "Analytics", group: "Operations" },
  { href: "/community", label: "Community", group: "Social" },
  { href: "/reviews", label: "Reviews", group: "Social" },
  { href: "/blog", label: "Medical Blog", group: "Social" },
  { href: "/messages", label: "Messages", group: "Comms" },
  { href: "/chat", label: "Chat", group: "Comms" },
  { href: "/notifications", label: "Notifications", group: "Comms" },
  { href: "/billing", label: "Billing", group: "Finance" },
  { href: "/subscriptions", label: "Subscriptions", group: "Finance" },
  { href: "/admin", label: "Admin Console", group: "Admin" },
];

export default async function HomePage() {
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
      include: { author: { select: { id: true, name: true, photoUrl: true } } },
      orderBy: { rating: "desc" },
      take: 6,
    }),
  ]);

  const groups = Array.from(new Set(ARCHITECTURE_MODULES.map((m) => m.group)));

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
            <Link href="/register" className="btn btn-primary">
              Get started
            </Link>
            <Link href="/search" className="btn btn-ghost">
              Search care
            </Link>
          </div>
        </div>
      </section>

      <section id="architecture" className="container-page section-block">
        <p className="badge">Architecture</p>
        <h2 className="font-display section-title">Platform modules</h2>
        <p className="muted">All modules below link to working pages with live APIs. Sign in for role-specific tools.</p>
        {groups.map((group) => (
          <div key={group} style={{ marginBottom: "1.5rem" }}>
            <h3 className="muted group-label">{group}</h3>
            <div className="module-grid">
              {ARCHITECTURE_MODULES.filter((m) => m.group === group).map((m) => (
                <Link key={m.href} href={m.href} className="module-link">
                  <div style={{ fontWeight: 600 }}>{m.label}</div>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </section>

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
                <li key={h.id}>{h.name} · {h.totalBeds} beds</li>
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
