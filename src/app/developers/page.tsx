"use client";

import { FormEvent, useEffect, useState } from "react";
import { PageShell } from "@/components/page-shell";

type AppRow = {
  id: string;
  name: string;
  sandbox: boolean;
  apiKeys: Array<{ id: string; name: string; keyPrefix: string; rateLimit: number; sandbox: boolean }>;
  webhooks: Array<{ id: string; url: string; eventsJson: string; deliveries: Array<{ id: string; event: string; status: string }> }>;
  usageLogs: Array<{ id: string; resource: string; method: string; statusCode: number; createdAt: string }>;
};

export default function DevelopersPage() {
  const [apps, setApps] = useState<AppRow[]>([]);
  const [scopes, setScopes] = useState<string[]>([]);
  const [sdk, setSdk] = useState<{ typescript: string; python: string; install: string; baseUrl: string; authHeader: string } | null>(null);
  const [rateLimits, setRateLimits] = useState<{ defaultPerMinute: number; sandboxPerMinute: number } | null>(null);
  const [rawKey, setRawKey] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [v1Sample, setV1Sample] = useState("");

  async function load() {
    const res = await fetch("/api/developers");
    const d = await res.json();
    if (!res.ok) {
      setError(d.error || "Sign in required");
      return;
    }
    setApps(d.apps || []);
    setScopes(d.scopes || []);
    setSdk(d.sdk || null);
    setRateLimits(d.rateLimits || null);
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <PageShell
      eyebrow="Developer"
      title="Healthcare API platform"
      description="Developer portal · SDK · API keys · sandbox · rate limits · webhooks. Integrate authentication, appointments, medical records (consent), lab, imaging, payments, notifications, prescriptions, telemedicine, wearables, and analytics."
    >
      {error && <p className="error-text">{error}</p>}
      {message && <p className="muted">{message}</p>}
      {rawKey && (
        <div className="panel" style={{ marginBottom: "1rem", borderColor: "#0f766e" }}>
          <strong>New API key (copy once):</strong>
          <pre style={{ wordBreak: "break-all" }}>{rawKey}</pre>
        </div>
      )}

      {sdk && (
        <div className="panel" style={{ marginBottom: "1rem" }}>
          <h3 style={{ marginTop: 0 }}>SDK & docs</h3>
          <p>
            TypeScript: <code>{sdk.typescript}</code> · Python: <code>{sdk.python}</code>
          </p>
          <p className="muted">{sdk.install}</p>
          <p>
            Base URL <code>{sdk.baseUrl}/{"{resource}"}</code>
          </p>
          <p>
            Auth: <code>{sdk.authHeader}</code>
          </p>
          <p className="muted">Resources: {scopes.join(", ")}</p>
          {rateLimits && (
            <p className="muted">
              Rate limits: live {rateLimits.defaultPerMinute}/min · sandbox {rateLimits.sandboxPerMinute}/min
            </p>
          )}
        </div>
      )}

      <form
        className="panel form-narrow"
        style={{ marginBottom: "1rem" }}
        onSubmit={async (e: FormEvent) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget as HTMLFormElement);
          const res = await fetch("/api/developers", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "create_app",
              name: fd.get("name"),
              description: fd.get("description"),
              sandbox: true,
            }),
          });
          const d = await res.json();
          if (!res.ok) setError(d.error);
          else {
            setMessage(`App created: ${d.app.name}`);
            load();
          }
        }}
      >
        <h3 style={{ marginTop: 0 }}>Create sandbox app</h3>
        <input className="input" name="name" required placeholder="App name" />
        <input className="input" name="description" placeholder="Description" />
        <button className="btn btn-primary form-submit" type="submit">
          Create app
        </button>
      </form>

      {apps.map((app) => (
        <div key={app.id} className="panel" style={{ marginBottom: "1rem" }}>
          <h3 style={{ marginTop: 0 }}>
            {app.name} {app.sandbox ? <span className="badge">sandbox</span> : <span className="badge">live</span>}
          </h3>
          <button
            className="btn"
            type="button"
            onClick={async () => {
              const res = await fetch("/api/developers", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "create_key", appId: app.id, name: "Portal key" }),
              });
              const d = await res.json();
              if (!res.ok) setError(d.error);
              else {
                setRawKey(d.rawKey);
                setMessage(d.warning);
                load();
              }
            }}
          >
            Mint API key
          </button>
          <button
            className="btn"
            type="button"
            onClick={async () => {
              await fetch("/api/developers", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  action: "register_webhook",
                  appId: app.id,
                  url: "https://example.com/medcare/webhooks",
                  events: ["appointment.created", "payment.completed", "lab.result_ready"],
                }),
              });
              setMessage("Webhook registered");
              load();
            }}
          >
            Add webhook
          </button>
          <button
            className="btn btn-primary"
            type="button"
            onClick={async () => {
              const res = await fetch("/api/developers", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "test_webhook", appId: app.id }),
              });
              const d = await res.json();
              setMessage(`Webhook deliveries: ${d.deliveries?.length || 0}`);
              load();
            }}
          >
            Test webhook
          </button>

          <h4>API keys</h4>
          {app.apiKeys.map((k) => (
            <p key={k.id} className="muted">
              {k.name} · {k.keyPrefix}… · {k.rateLimit}/min
              <button
                className="btn"
                type="button"
                style={{ marginLeft: "0.5rem" }}
                onClick={async () => {
                  await fetch("/api/developers", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ action: "revoke_key", keyId: k.id }),
                  });
                  load();
                }}
              >
                Revoke
              </button>
            </p>
          ))}

          <h4>Webhooks</h4>
          {app.webhooks.map((w) => (
            <div key={w.id}>
              <p className="muted">
                {w.url} · {w.eventsJson}
              </p>
              {w.deliveries.map((d) => (
                <p key={d.id} className="muted">
                  → {d.event}: {d.status}
                </p>
              ))}
            </div>
          ))}

          <h4>Usage</h4>
          {app.usageLogs.slice(0, 8).map((u) => (
            <p key={u.id} className="muted">
              {u.method} {u.resource} → {u.statusCode}
            </p>
          ))}

          {rawKey && (
            <button
              className="btn"
              type="button"
              onClick={async () => {
                const res = await fetch("/api/v1/appointments", {
                  headers: { Authorization: `Bearer ${rawKey}` },
                });
                const d = await res.json();
                setV1Sample(JSON.stringify(d, null, 2));
              }}
            >
              Call sandbox /api/v1/appointments
            </button>
          )}
        </div>
      ))}

      {v1Sample && (
        <pre className="panel" style={{ whiteSpace: "pre-wrap", fontSize: "0.8rem" }}>
          {v1Sample}
        </pre>
      )}
    </PageShell>
  );
}
