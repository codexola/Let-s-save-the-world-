"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { PageShell } from "@/components/page-shell";
import { BlogCard } from "@/components/BlogCard";
type Post = Parameters<typeof BlogCard>[0]["post"] & {
  tags?: string | null;
  category?: string | null;
  likeCount?: number;
  likedByMe?: boolean;
  bookmarkedByMe?: boolean;
  author?: { id: string; name: string; photoUrl?: string | null; role?: string };
  _count?: { likes?: number; bookmarks?: number; comments?: number };
};

export default function BlogListPage() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [message, setMessage] = useState("");
  const [loggedIn, setLoggedIn] = useState(false);
  const [role, setRole] = useState("");
  const [q, setQ] = useState("");
  const [tag, setTag] = useState("");
  const [showBookmarks, setShowBookmarks] = useState(false);

  async function load(opts?: { q?: string; tag?: string; bookmarks?: boolean }) {
    const params = new URLSearchParams();
    if (opts?.bookmarks) params.set("bookmarks", "1");
    if (opts?.q) params.set("q", opts.q);
    if (opts?.tag) params.set("tag", opts.tag);
    params.set("limit", "40");
    const res = await fetch(`/api/blogs?${params}`);
    const data = await res.json();
    setPosts(data.posts || []);
  }

  useEffect(() => {
    load();
    fetch("/api/auth")
      .then((r) => r.json())
      .then((d) => {
        setLoggedIn(!!d.user);
        setRole(d.user?.role || "");
      });
  }, []);

  const canPublish = ["DOCTOR", "HOSPITAL", "NURSE", "ADMIN", "DEVELOPER"].includes(role);

  async function createPost(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const res = await fetch("/api/blogs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "create",
        title: fd.get("title"),
        content: fd.get("content"),
        coverImage: fd.get("coverImage"),
        tags: fd.get("tags"),
        category: fd.get("category"),
        published: true,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setMessage(data.error);
      return;
    }
    setMessage("Article published!");
    load({ q, tag });
    (e.target as HTMLFormElement).reset();
  }

  async function toggle(action: "like" | "bookmark", postId: string) {
    const res = await fetch("/api/blogs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, postId }),
    });
    if (res.ok) load({ q, tag, bookmarks: showBookmarks });
  }

  const allTags = Array.from(
    new Set(
      posts
        .flatMap((p) => (p.tags || "").split(","))
        .map((t) => t.trim())
        .filter(Boolean)
    )
  );

  return (
    <PageShell
      eyebrow="Medical blog"
      title="Articles"
      description="Doctors, hospitals & researchers · medical news · comments · likes · bookmarks · tags · search."
    >
      <div className="panel" style={{ marginBottom: "1rem", display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        <input
          className="input"
          style={{ flex: 1, minWidth: 180 }}
          placeholder="Search articles…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <button className="btn btn-primary" type="button" onClick={() => load({ q, tag })}>
          Search
        </button>
        {loggedIn && (
          <button
            className="btn"
            type="button"
            onClick={() => {
              const next = !showBookmarks;
              setShowBookmarks(next);
              load({ bookmarks: next, q, tag });
            }}
          >
            {showBookmarks ? "All posts" : "My bookmarks"}
          </button>
        )}
      </div>

      {allTags.length > 0 && (
        <p style={{ marginBottom: "1rem" }}>
          {allTags.map((t) => (
            <button
              key={t}
              className="btn btn-ghost"
              type="button"
              style={{ marginRight: "0.35rem", marginBottom: "0.35rem" }}
              onClick={() => {
                setTag(t);
                load({ q, tag: t });
              }}
            >
              #{t}
            </button>
          ))}
          {tag && (
            <button
              className="btn"
              type="button"
              onClick={() => {
                setTag("");
                load({ q });
              }}
            >
              Clear tag
            </button>
          )}
        </p>
      )}

      <div className="blog-grid">
        {posts.map((p) => (
          <div key={p.id}>
            <BlogCard post={p} />
            <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.35rem", flexWrap: "wrap" }}>
              {p.category && <span className="badge">{p.category}</span>}
              {p.author?.role && <span className="badge">{p.author.role}</span>}
              <span className="muted">♥ {p.likeCount ?? p._count?.likes ?? 0}</span>
              {loggedIn && (
                <>
                  <button className="btn btn-ghost" type="button" onClick={() => toggle("like", p.id)}>
                    {p.likedByMe ? "Unlike" : "Like"}
                  </button>
                  <button className="btn btn-ghost" type="button" onClick={() => toggle("bookmark", p.id)}>
                    {p.bookmarkedByMe ? "Unbookmark" : "Bookmark"}
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      {canPublish ? (
        <form className="panel form-narrow" style={{ marginTop: "2rem" }} onSubmit={createPost}>
          <h2 style={{ marginTop: 0 }}>Publish article</h2>
          <label className="label">Title</label>
          <input className="input" name="title" required />
          <label className="label">Cover image URL (required)</label>
          <input
            className="input"
            name="coverImage"
            required
            placeholder="https://images.unsplash.com/..."
          />
          <label className="label">Category</label>
          <select className="input" name="category" defaultValue="medical_news">
            <option value="medical_news">Medical news</option>
            <option value="research">Research</option>
            <option value="hospital">Hospital update</option>
            <option value="doctor">Doctor insight</option>
          </select>
          <label className="label">Content</label>
          <textarea className="input" name="content" rows={6} required />
          <label className="label">Tags</label>
          <input className="input" name="tags" placeholder="health,news,cardiology" />
          {message && <p className="muted">{message}</p>}
          <button className="btn btn-primary form-submit" type="submit">
            Publish
          </button>
        </form>
      ) : loggedIn ? (
        <p className="muted" style={{ marginTop: "1.5rem" }}>
          Publishing is limited to doctors, hospitals, nurses, and researchers.
        </p>
      ) : (
        <p className="muted" style={{ marginTop: "1.5rem" }}>
          <Link href="/login">Sign in</Link> to like, bookmark, or publish.
        </p>
      )}
    </PageShell>
  );
}
