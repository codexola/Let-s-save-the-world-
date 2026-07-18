"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { PageShell } from "@/components/page-shell";
import { BlogCard } from "@/components/BlogCard";
type Post = Parameters<typeof BlogCard>[0]["post"];

export default function BlogListPage() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [message, setMessage] = useState("");
  const [loggedIn, setLoggedIn] = useState(false);

  async function load() {
    const res = await fetch("/api/blogs");
    const data = await res.json();
    setPosts(data.posts || []);
  }

  useEffect(() => {
    load();
    fetch("/api/auth")
      .then((r) => r.json())
      .then((d) => setLoggedIn(!!d.user));
  }, []);

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
        published: true,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setMessage(data.error);
      return;
    }
    setMessage("Article published!");
    load();
    (e.target as HTMLFormElement).reset();
  }

  return (
    <PageShell eyebrow="Medical blog" title="Articles" description="Cover photo required for every article.">
      <div className="blog-grid">
        {posts.map((p) => (
          <BlogCard key={p.id} post={p} />
        ))}
      </div>

      {loggedIn ? (
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
          <label className="label">Content</label>
          <textarea className="input" name="content" rows={6} required />
          <label className="label">Tags</label>
          <input className="input" name="tags" placeholder="health,news" />
          {message && <p className="muted">{message}</p>}
          <button className="btn btn-primary form-submit" type="submit">
            Publish
          </button>
        </form>
      ) : (
        <p className="muted" style={{ marginTop: "1.5rem" }}>
          <Link href="/login">Sign in</Link> to publish articles.
        </p>
      )}
    </PageShell>
  );
}
