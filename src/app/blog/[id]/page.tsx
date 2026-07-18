"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { PageShell } from "@/components/page-shell";
import { ViewerAvatars } from "@/components/ViewerAvatars";

type Comment = {
  id: string;
  body: string;
  rating: number | null;
  author: { id: string; name: string; photoUrl?: string | null };
  replies: Comment[];
};

type Post = {
  id: string;
  title: string;
  content: string;
  coverImage: string;
  viewCount: number;
  likeCount?: number;
  tags?: string | null;
  category?: string | null;
  author: { id: string; name: string; photoUrl?: string | null; bio?: string | null; role?: string };
  views: Array<{ viewer: { id: string; name: string; photoUrl?: string | null } }>;
  comments: Comment[];
};

export default function BlogDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const [postId, setPostId] = useState("");
  const [post, setPost] = useState<Post | null>(null);
  const [loggedIn, setLoggedIn] = useState(false);
  const [msg, setMsg] = useState("");
  const [liked, setLiked] = useState(false);
  const [bookmarked, setBookmarked] = useState(false);

  useEffect(() => {
    params.then((p) => setPostId(p.id));
  }, [params]);

  useEffect(() => {
    if (!postId) return;
    fetch(`/api/blogs/${postId}`)
      .then((r) => r.json())
      .then((d) => {
        setPost(d.post);
        setLiked(!!d.post?.likedByMe);
        setBookmarked(!!d.post?.bookmarkedByMe);
      });
    fetch("/api/blogs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "record_view", postId }),
    }).then((r) => r.json()).then((d) => {
      if (d.post) setPost((prev) => (prev ? { ...prev, viewCount: d.post.viewCount, views: d.post.views } : prev));
    });
    fetch("/api/auth")
      .then((r) => r.json())
      .then((d) => setLoggedIn(!!d.user));
  }, [postId]);

  async function addComment(e: FormEvent<HTMLFormElement>, parentId?: string) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const res = await fetch("/api/blogs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: parentId ? "reply" : "comment",
        postId,
        parentId,
        body: fd.get("body"),
        rating: fd.get("rating") ? Number(fd.get("rating")) : undefined,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setMsg(data.error);
      return;
    }
    const refreshed = await fetch(`/api/blogs/${postId}`).then((r) => r.json());
    setPost(refreshed.post);
    (e.target as HTMLFormElement).reset();
  }

  if (!post) {
    return (
      <PageShell eyebrow="Blog" title="Loading…" description="">
        <p className="muted">Loading article…</p>
      </PageShell>
    );
  }

  return (
    <PageShell eyebrow="Blog" title={post.title} description="">
      <article className="panel">
        <p className="blog-author-lg">
          {post.author.photoUrl && <img src={post.author.photoUrl} alt="" className="avatar-md" />}
          <span>
            <Link href={`/profile/${post.author.id}`}>{post.author.name}</Link>
          </span>
        </p>
        <img src={post.coverImage} alt="" className="blog-cover-full" />
        <p style={{ whiteSpace: "pre-wrap", lineHeight: 1.7 }}>{post.content}</p>
        <div className="blog-meta">
          <span className="muted">{post.viewCount} views</span>
          <span className="muted">♥ {post.likeCount ?? 0}</span>
          {post.category && <span className="badge">{post.category}</span>}
          {post.tags &&
            post.tags.split(",").map((t) => (
              <span key={t} className="badge">
                #{t.trim()}
              </span>
            ))}
          <ViewerAvatars viewers={post.views} />
        </div>
        {loggedIn && (
          <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.75rem" }}>
            <button
              className="btn"
              type="button"
              onClick={async () => {
                const res = await fetch("/api/blogs", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ action: "like", postId }),
                });
                const d = await res.json();
                if (res.ok) {
                  setLiked(d.liked);
                  setPost((prev) =>
                    prev
                      ? {
                          ...prev,
                          likeCount: Math.max(0, (prev.likeCount || 0) + (d.liked ? 1 : -1)),
                        }
                      : prev
                  );
                }
              }}
            >
              {liked ? "Unlike" : "Like"}
            </button>
            <button
              className="btn"
              type="button"
              onClick={async () => {
                const res = await fetch("/api/blogs", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ action: "bookmark", postId }),
                });
                const d = await res.json();
                if (res.ok) setBookmarked(d.bookmarked);
              }}
            >
              {bookmarked ? "Unbookmark" : "Bookmark"}
            </button>
          </div>
        )}
      </article>

      <section style={{ marginTop: "1.5rem" }}>
        <h2>Evaluation comments</h2>
        {post.comments.map((c) => (
          <div key={c.id} className="panel" style={{ marginBottom: "0.75rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              {c.author.photoUrl && <img src={c.author.photoUrl} alt="" className="avatar-sm" />}
              <strong>{c.author.name}</strong>
              {c.rating && <span className="badge">{"★".repeat(c.rating)}</span>}
            </div>
            <p>{c.body}</p>
            {c.replies.map((r) => (
              <div key={r.id} className="reply-block">
                {r.author.photoUrl && <img src={r.author.photoUrl} alt="" className="avatar-sm" />}
                <strong>{r.author.name}</strong>
                {r.rating && <span className="badge">{"★".repeat(r.rating)}</span>}
                <p>{r.body}</p>
              </div>
            ))}
            {loggedIn && (
              <form onSubmit={(e) => addComment(e, c.id)} className="reply-form">
                <input className="input" name="body" placeholder="Reply with evaluation…" required />
                <select className="input" name="rating" defaultValue="">
                  <option value="">Rating (optional)</option>
                  {[5, 4, 3, 2, 1].map((n) => (
                    <option key={n} value={n}>
                      {n} stars
                    </option>
                  ))}
                </select>
                <button className="btn btn-ghost" type="submit">
                  Reply
                </button>
              </form>
            )}
          </div>
        ))}

        {loggedIn ? (
          <form className="panel form-narrow" onSubmit={(e) => addComment(e)}>
            <h3>Add evaluation</h3>
            <textarea className="input" name="body" rows={3} required />
            <select className="input" name="rating" defaultValue="5">
              {[5, 4, 3, 2, 1].map((n) => (
                <option key={n} value={n}>
                  {n} stars
                </option>
              ))}
            </select>
            {msg && <p className="error-text">{msg}</p>}
            <button className="btn btn-primary form-submit" type="submit">
              Post comment
            </button>
          </form>
        ) : (
          <p className="muted">
            <Link href="/login">Sign in</Link> to comment.
          </p>
        )}
      </section>
    </PageShell>
  );
}
