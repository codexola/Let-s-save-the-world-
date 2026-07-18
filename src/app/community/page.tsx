"use client";

import { FormEvent, useEffect, useState } from "react";
import { PageShell } from "@/components/page-shell";

type Post = {
  id: string;
  title: string;
  body: string;
  topic: string | null;
  likeCount: number;
  createdAt: string;
  author: { id: string; name: string; photoUrl?: string | null };
};

export default function CommunityPage() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [topic, setTopic] = useState("");
  const [error, setError] = useState("");

  async function load() {
    const res = await fetch("/api/community");
    const data = await res.json();
    setPosts(data.posts || []);
  }

  useEffect(() => {
    load();
  }, []);

  async function createPost(e: FormEvent) {
    e.preventDefault();
    setError("");
    const res = await fetch("/api/community", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, body, topic: topic || undefined }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error);
      return;
    }
    setTitle("");
    setBody("");
    load();
  }

  async function like(postId: string) {
    await fetch("/api/community", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "like", postId }),
    });
    load();
  }

  return (
    <PageShell
      eyebrow="Community"
      title="Healthcare community"
      description="Share stories, ask questions, and support others."
    >
      <form className="panel" onSubmit={createPost}>
        <label className="label">Title</label>
        <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} required />
        <label className="label">Topic</label>
        <input className="input" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="e.g. hypertension" />
        <label className="label">Body</label>
        <textarea className="input" rows={4} value={body} onChange={(e) => setBody(e.target.value)} required />
        {error && <p className="error-text">{error}</p>}
        <button className="btn btn-primary form-submit" type="submit">Post</button>
      </form>

      <div style={{ marginTop: "1.25rem" }}>
        {posts.map((p) => (
          <div key={p.id} className="panel" style={{ marginBottom: "0.75rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              {p.author.photoUrl && <img src={p.author.photoUrl} alt="" className="avatar-sm" />}
              <strong>{p.author.name}</strong>
              {p.topic && <span className="badge">{p.topic}</span>}
            </div>
            <h3>{p.title}</h3>
            <p>{p.body}</p>
            <button className="btn btn-ghost" type="button" onClick={() => like(p.id)}>
              ♥ {p.likeCount}
            </button>
          </div>
        ))}
      </div>
    </PageShell>
  );
}
