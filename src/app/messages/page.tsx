"use client";

import { FormEvent, useEffect, useState } from "react";
import { PageShell } from "@/components/page-shell";

type Contact = { id: string; name: string; role: string; email: string; photoUrl?: string | null };

type Thread = {
  id: string;
  chatEnabled: boolean;
  myAgreed: boolean;
  partnerAgreed: boolean;
  pairType?: string | null;
  encrypted?: boolean;
  participantA: { id: string; name: string; photoUrl?: string | null; role?: string };
  participantB: { id: string; name: string; photoUrl?: string | null; role?: string };
};

type Message = {
  id: string;
  body: string;
  attachment?: string | null;
  attachmentType?: string | null;
  attachmentName?: string | null;
  prescriptionId?: string | null;
  sender: { id: string; name: string; photoUrl?: string | null };
};

type Rx = { id: string; medication: string; status: string };

export default function MessagesPage() {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [prescriptions, setPrescriptions] = useState<Rx[]>([]);
  const [selected, setSelected] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [notice, setNotice] = useState("");
  const [partnerId, setPartnerId] = useState("");
  const [error, setError] = useState("");
  const [attachmentType, setAttachmentType] = useState("image");
  const [attachmentUrl, setAttachmentUrl] = useState("");
  const [attachmentName, setAttachmentName] = useState("");
  const [prescriptionId, setPrescriptionId] = useState("");

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
    fetch("/api/messages?contacts=1")
      .then((r) => r.json())
      .then((d) => setContacts(d.contacts || []));
    fetch("/api/pharmacy")
      .then((r) => r.json())
      .then((d) => setPrescriptions(d.prescriptions || []));
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
    setError("");
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
    setNotice(data.notice || (data.encrypted ? "End-to-rest encrypted messaging active" : ""));
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
        attachment: attachmentUrl || undefined,
        attachmentType: attachmentUrl || prescriptionId ? attachmentType : undefined,
        attachmentName: attachmentName || undefined,
        prescriptionId: prescriptionId || undefined,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setNotice(data.error);
      return;
    }
    setAttachmentUrl("");
    setAttachmentName("");
    setPrescriptionId("");
    loadMessages(selected);
    (e.target as HTMLFormElement).reset();
  }

  const current = threads.find((t) => t.id === selected);

  return (
    <PageShell
      eyebrow="Chat"
      title="Secure role-based messaging"
      description="Patient↔Doctor/Nurse/Hospital, Doctor↔Hospital, Company↔Hospital/Employee. AES-encrypted at rest. Images, PDF, documents, voice, video links, prescription sharing."
    >
      {error && <p className="error-text">{error}</p>}

      <form className="panel" onSubmit={requestThread}>
        <label className="label">Start chat with contact</label>
        <select className="input" value={partnerId} onChange={(e) => setPartnerId(e.target.value)} required>
          <option value="">Select allowed contact…</option>
          {contacts.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} ({c.role}) — {c.email}
            </option>
          ))}
        </select>
        <button className="btn btn-primary form-submit" type="submit">
          Request encrypted thread
        </button>
      </form>

      <div className="two-col-grid" style={{ marginTop: "1rem" }}>
        <div className="panel">
          <h2 style={{ marginTop: 0 }}>Threads</h2>
          {threads.map((t) => (
            <button key={t.id} type="button" className="thread-btn" onClick={() => loadMessages(t.id)}>
              {t.participantA.name} ↔ {t.participantB.name}
              {t.pairType ? ` · ${t.pairType}` : ""}
              {!t.chatEnabled && <span className="muted"> · pending</span>}
              {t.encrypted && <span className="muted"> · 🔒</span>}
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
                  I agree to encrypted chat
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
                {m.attachmentType && (
                  <div className="muted" style={{ fontSize: "0.85rem" }}>
                    [{m.attachmentType}] {m.attachmentName || ""}
                    {m.attachment && (
                      <>
                        {" · "}
                        <a href={m.attachment} target="_blank" rel="noreferrer">
                          Open
                        </a>
                      </>
                    )}
                    {m.prescriptionId && <> · Rx {m.prescriptionId.slice(0, 8)}</>}
                  </div>
                )}
                {m.attachmentType === "image" && m.attachment && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={m.attachment} alt="" style={{ maxWidth: 180, marginTop: 4, borderRadius: 6 }} />
                )}
              </div>
            ))}
          </div>
          {current?.chatEnabled && (
            <form onSubmit={sendMessage} style={{ marginTop: "1rem" }}>
              <textarea className="input" name="body" rows={3} placeholder="Encrypted message…" />
              <label className="label">Attachment type</label>
              <select className="input" value={attachmentType} onChange={(e) => setAttachmentType(e.target.value)}>
                <option value="image">Image</option>
                <option value="pdf">PDF</option>
                <option value="document">Medical document</option>
                <option value="voice">Voice (URL)</option>
                <option value="video">Video (URL)</option>
                <option value="prescription">Prescription</option>
              </select>
              <label className="label">Attachment URL</label>
              <input
                className="input"
                value={attachmentUrl}
                onChange={(e) => setAttachmentUrl(e.target.value)}
                placeholder="https://… or data URI"
              />
              <label className="label">File name</label>
              <input className="input" value={attachmentName} onChange={(e) => setAttachmentName(e.target.value)} />
              <label className="label">Share prescription</label>
              <select className="input" value={prescriptionId} onChange={(e) => setPrescriptionId(e.target.value)}>
                <option value="">None</option>
                {prescriptions.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.medication} ({p.status})
                  </option>
                ))}
              </select>
              <button className="btn btn-primary form-submit" type="submit">
                Send encrypted
              </button>
            </form>
          )}
        </div>
      </div>
    </PageShell>
  );
}
