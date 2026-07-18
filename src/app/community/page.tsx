"use client";

import { FormEvent, useEffect, useState } from "react";
import { PageShell } from "@/components/page-shell";

type Author = { id: string; name: string; role: string; verified: boolean };
type Post = {
  id: string;
  title: string;
  body: string;
  postType: string;
  likeCount: number;
  status: string;
  flagged: boolean;
  author: Author;
  community?: { name: string; disease: string } | null;
  comments: Array<{ id: string; body: string; author: Author }>;
  qaAnswers: Array<{ id: string; body: string; accepted: boolean; author: Author }>;
};

function ProBadge({ author }: { author: Author }) {
  const pro = ["DOCTOR", "NURSE", "HOSPITAL", "RESEARCHER"].includes(author.role);
  if (!pro) return null;
  return (
    <span className="badge" style={{ background: "#0f766e", color: "#fff" }}>
      Verified {author.role.toLowerCase()}
      {author.verified ? "" : ""}
    </span>
  );
}

export default function CommunityPage() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [communities, setCommunities] = useState<Array<{ id: string; name: string; disease: string; _count: { members: number } }>>([]);
  const [followTargets, setFollowTargets] = useState<Author[]>([]);
  const [following, setFollowing] = useState<string[]>([]);
  const [bookmarks, setBookmarks] = useState<string[]>([]);
  const [flags, setFlags] = useState<Array<{ id: string; reason: string; misinfo: boolean; post: { title: string } }>>([]);
  const [session, setSession] = useState<{ role: string; isClinician: boolean } | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [postType, setPostType] = useState("discussion");
  const [communityId, setCommunityId] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function load() {
    const res = await fetch("/api/social");
    const d = await res.json();
    if (d.error) setError(d.error);
    setPosts(d.posts || []);
    setCommunities(d.communities || []);
    setFollowTargets(d.followTargets || []);
    setFollowing(d.following || []);
    setBookmarks(d.bookmarks || []);
    setFlags(d.openFlags || []);
    setSession(d.session);
    if (d.communities?.[0]?.id) setCommunityId(d.communities[0].id);
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <PageShell
      eyebrow="Social"
      title="Healthcare social network"
      description="Follow hospitals, doctors, and researchers · disease communities · recovery stories · comment · like · bookmark · moderated Q&A. Professionals are identified; misinformation is moderated."
    >
      {error && <p className="error-text">{error}</p>}
      {message && <p className="muted">{message}</p>}

      <h3>Follow hospitals, doctors, researchers</h3>
      <div className="feature-grid" style={{ marginBottom: "1rem" }}>
        {followTargets.map((t) => (
          <div key={t.id} className="panel">
            <strong>{t.name}</strong> <ProBadge author={t} />
            <p className="muted">{t.role}</p>
            <button
              className="btn"
              type="button"
              onClick={async () => {
                await fetch("/api/social", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    action: following.includes(t.id) ? "unfollow" : "follow",
                    targetId: t.id,
                  }),
                });
                load();
              }}
            >
              {following.includes(t.id) ? "Following" : "Follow"}
            </button>
          </div>
        ))}
      </div>

      <h3>Disease-specific communities</h3>
      <div className="feature-grid" style={{ marginBottom: "1rem" }}>
        {communities.map((c) => (
          <div key={c.id} className="panel">
            <strong>{c.name}</strong>
            <p className="muted">
              {c.disease} · {c._count.members} members · moderated
            </p>
            <button
              className="btn btn-primary"
              type="button"
              onClick={async () => {
                await fetch("/api/social", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ action: "join", communityId: c.id }),
                });
                setCommunityId(c.id);
                setMessage(`Joined ${c.name}`);
                load();
              }}
            >
              Join
            </button>
          </div>
        ))}
      </div>

      <form
        className="panel form-narrow"
        style={{ marginBottom: "1rem" }}
        onSubmit={async (e: FormEvent) => {
          e.preventDefault();
          const res = await fetch("/api/social", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "post", title, body, postType, communityId }),
          });
          const d = await res.json();
          if (!res.ok) setError(d.error);
          else {
            setTitle("");
            setBody("");
            setMessage(d.post.status === "held" ? "Post held for misinformation review" : "Posted");
            load();
          }
        }}
      >
        <h3 style={{ marginTop: 0 }}>Share / ask</h3>
        <select className="input" value={postType} onChange={(e) => setPostType(e.target.value)}>
          <option value="discussion">Discussion</option>
          <option value="recovery_story">Recovery story</option>
          <option value="qa">Moderated Q&A</option>
        </select>
        <select className="input" value={communityId} onChange={(e) => setCommunityId(e.target.value)}>
          {communities.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" required />
        <textarea className="input" rows={3} value={body} onChange={(e) => setBody(e.target.value)} required />
        <button className="btn btn-primary form-submit" type="submit">
          Publish
        </button>
      </form>

      {session && ["ADMIN", "DEVELOPER", "DOCTOR", "HOSPITAL"].includes(session.role) && flags.length > 0 && (
        <div className="panel" style={{ marginBottom: "1rem" }}>
          <h3 style={{ marginTop: 0 }}>Misinformation moderation queue</h3>
          {flags.map((f) => (
            <div key={f.id} style={{ marginBottom: "0.5rem" }}>
              <p>
                {f.post.title} — {f.reason} {f.misinfo ? "(misinfo)" : ""}
              </p>
              <button
                className="btn"
                type="button"
                onClick={async () => {
                  await fetch("/api/social", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ action: "moderate", flagId: f.id, decision: "remove" }),
                  });
                  load();
                }}
              >
                Remove
              </button>
              <button
                className="btn"
                type="button"
                onClick={async () => {
                  await fetch("/api/social", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ action: "moderate", flagId: f.id, decision: "clear" }),
                  });
                  load();
                }}
              >
                Clear
              </button>
            </div>
          ))}
        </div>
      )}

      <h3>Feed</h3>
      {posts.map((p) => (
        <div key={p.id} className="panel" style={{ marginBottom: "0.75rem" }}>
          <p className="badge">{p.postType.replace(/_/g, " ")}</p>
          <h3 style={{ marginTop: 0 }}>{p.title}</h3>
          <p>
            {p.author.name} <ProBadge author={p.author} /> · {p.community?.name}
            {p.flagged ? " · flagged" : ""}
          </p>
          <p>{p.body}</p>
          <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap" }}>
            <button
              className="btn"
              type="button"
              onClick={async () => {
                await fetch("/api/social", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ action: "like", postId: p.id }),
                });
                load();
              }}
            >
              Like ({p.likeCount})
            </button>
            <button
              className="btn"
              type="button"
              onClick={async () => {
                await fetch("/api/social", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ action: "bookmark", postId: p.id }),
                });
                load();
              }}
            >
              {bookmarks.includes(p.id) ? "Bookmarked" : "Bookmark"}
            </button>
            <button
              className="btn"
              type="button"
              onClick={async () => {
                const text = window.prompt("Comment");
                if (!text) return;
                await fetch("/api/social", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ action: "comment", postId: p.id, body: text }),
                });
                load();
              }}
            >
              Comment
            </button>
            {p.postType === "qa" && (
              <button
                className="btn btn-primary"
                type="button"
                onClick={async () => {
                  const text = window.prompt("Q&A answer");
                  if (!text) return;
                  await fetch("/api/social", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ action: "qa_answer", postId: p.id, body: text }),
                  });
                  load();
                }}
              >
                Answer Q&A
              </button>
            )}
            <button
              className="btn"
              type="button"
              onClick={async () => {
                await fetch("/api/social", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ action: "flag", postId: p.id, misinfo: true }),
                });
                setMessage("Reported for moderation");
                load();
              }}
            >
              Report misinfo
            </button>
          </div>
          {p.comments.map((c) => (
            <p key={c.id} className="muted">
              💬 {c.author.name} <ProBadge author={c.author} />: {c.body}
            </p>
          ))}
          {p.qaAnswers.map((a) => (
            <p key={a.id}>
              Q&A {a.accepted ? "✓" : ""} {a.author.name} <ProBadge author={a.author} />: {a.body}
            </p>
          ))}
        </div>
      ))}
    </PageShell>
  );
}
