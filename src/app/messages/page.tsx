"use client";

import { FormEvent, useEffect, useState } from "react";
import { PageShell } from "@/components/page-shell";

type Thread = {
  id: string;
  chatEnabled: boolean;
  myAgreed: boolean;
  partnerAgreed: boolean;
  participantA: { id: string; name: string; photoUrl?: string | null };
  participantB: { id: string; name: string; photoUrl?: string | null };
  messages: Array<{ body: string; sender: { name: string } }>;
};

type Message = {
  id: string;
  body: string;
  sender: { id: string; name: string; photoUrl?: string | null };
};

export default function MessagesPage() {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [notice, setNotice] = useState("");
  const [partnerId, setPartnerId] = useState("");
  const [error, setError] = useState("");

  async function loadThreads() {
    const res = await fetch("/api/messages");
    if (!res.ok) {
      setError((await res.json()).error);
      return;
    }
    setThreads((await res.json()).threads || []);
  }

  useEffect(() => {
    loadThreads();
  }, []);

  async function requestThread(e: FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "request_thread", partnerId }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error);
      return;
    }
    setSelected(data.thread.id);
    loadThreads();
  }

  async function agree(threadId: string) {
    await fetch("/api/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "agree", threadId }),
    });
    loadThreads();
    loadMessages(threadId);
  }

  async function loadMessages(threadId: string) {
    setSelected(threadId);
    const res = await fetch("/api/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "list_messages", threadId }),
    });
    const data = await res.json();
    setMessages(data.messages || []);
    setNotice(data.notice || "");
  }

  async function sendMessage(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const res = await fetch("/api/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "send",
        threadId: selected,
        body: fd.get("body"),
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setNotice(data.error);
      return;
    }
    loadMessages(selected);
    (e.target as HTMLFormElement).reset();
  }

  const current = threads.find((t) => t.id === selected);

  return (
    <PageShell
      eyebrow="Messages"
      title="Secure messaging"
      description="Both parties must agree before chat is enabled."
    >
      {error && <p className="error-text">{error}. <a href="/login">Sign in</a></p>}

      <form className="panel" onSubmit={requestThread} style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
        <input
          className="input"
          placeholder="Partner user ID"
          value={partnerId}
          onChange={(e) => setPartnerId(e.target.value)}
          style={{ flex: 1, minWidth: 200 }}
        />
        <button className="btn btn-ghost" type="submit">
          Request thread
        </button>
      </form>

      <div className="two-col-grid" style={{ marginTop: "1rem" }}>
        <div className="panel">
          <h2 style={{ marginTop: 0 }}>Threads</h2>
          {threads.map((t) => (
            <button
              key={t.id}
              type="button"
              className="thread-btn"
              onClick={() => loadMessages(t.id)}
            >
              {t.participantA.name} ↔ {t.participantB.name}
              {!t.chatEnabled && <span className="muted"> · pending agreement</span>}
            </button>
          ))}
        </div>

        <div className="panel">
          <h2 style={{ marginTop: 0 }}>Chat</h2>
          {current && !current.chatEnabled && (
            <div style={{ marginBottom: "1rem" }}>
              <p className="muted">
                You: {current.myAgreed ? "agreed" : "not agreed"} · Partner:{" "}
                {current.partnerAgreed ? "agreed" : "not agreed"}
              </p>
              {!current.myAgreed && (
                <button className="btn btn-primary" type="button" onClick={() => agree(current.id)}>
                  I agree to chat
                </button>
              )}
            </div>
          )}
          {notice && <p className="muted">{notice}</p>}
          <div className="chat-log">
            {messages.map((m) => (
              <div key={m.id} className="chat-msg">
                {m.sender.photoUrl && <img src={m.sender.photoUrl} alt="" className="avatar-sm" />}
                <strong>{m.sender.name}:</strong> {m.body}
              </div>
            ))}
          </div>
          {current?.chatEnabled && (
            <form onSubmit={sendMessage} style={{ marginTop: "1rem" }}>
              <textarea className="input" name="body" rows={3} required />
              <button className="btn btn-primary form-submit" type="submit">
                Send
              </button>
            </form>
          )}
        </div>
      </div>
    </PageShell>
  );
}
