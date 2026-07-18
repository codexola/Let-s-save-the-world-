"use client";

import { FormEvent, useEffect, useState } from "react";
import { startRegistration } from "@simplewebauthn/browser";
import { PageShell } from "@/components/page-shell";

type Cred = { id: string; nickname: string | null; deviceType: string | null; createdAt: string };

export default function SecurityPage() {
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
  const [setupSecret, setSetupSecret] = useState("");
  const [otpauthUrl, setOtpauthUrl] = useState("");
  const [token, setToken] = useState("");
  const [credentials, setCredentials] = useState<Cred[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [posture, setPosture] = useState<Record<string, unknown> | null>(null);

  async function load() {
    const [t, w] = await Promise.all([
      fetch("/api/auth/2fa").then((r) => r.json()),
      fetch("/api/auth/webauthn").then((r) => r.json()),
    ]);
    if (t.error || w.error) {
      setError(t.error || w.error);
      return;
    }
    setTwoFactorEnabled(Boolean(t.twoFactorEnabled));
    setCredentials(w.credentials || []);
  }

  useEffect(() => {
    load();
  }, []);

  async function setup2fa() {
    setError("");
    const res = await fetch("/api/auth/2fa", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "setup" }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error);
      return;
    }
    setSetupSecret(data.secret);
    setOtpauthUrl(data.otpauthUrl);
    setMessage("Scan the otpauth URL in your authenticator app, then enter a code to enable.");
  }

  async function enable2fa(e: FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/auth/2fa", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "enable", token }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error);
      return;
    }
    setMessage("Two-factor authentication enabled");
    setSetupSecret("");
    setToken("");
    load();
  }

  async function disable2fa(e: FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/auth/2fa", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "disable", token }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error);
      return;
    }
    setMessage("Two-factor authentication disabled");
    setToken("");
    load();
  }

  async function registerPasskey() {
    setError("");
    try {
      const optRes = await fetch("/api/auth/webauthn", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "register_options", platformOnly: true }),
      });
      const optData = await optRes.json();
      if (!optRes.ok) {
        setError(optData.error);
        return;
      }
      const attResp = await startRegistration({ optionsJSON: optData.options });
      const verifyRes = await fetch("/api/auth/webauthn", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "register_verify",
          response: attResp,
          nickname: "Device biometric",
        }),
      });
      const verifyData = await verifyRes.json();
      if (!verifyRes.ok) {
        setError(verifyData.error);
        return;
      }
      setMessage("Biometric / passkey registered");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration cancelled");
    }
  }

  async function deleteCred(id: string) {
    await fetch("/api/auth/webauthn", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", credentialId: id }),
    });
    load();
  }

  return (
    <PageShell
      eyebrow="Security"
      title="Account & platform security"
      description="TLS · AES-256 · RBAC · MFA · audit logs · encryption · backup · DR · intrusion detection · rate limiting · DDoS · Zero Trust."
    >
      {error && <p className="error-text">{error}</p>}
      {message && <p className="muted">{message}</p>}

      <div className="panel" style={{ marginBottom: "1.25rem" }}>
        <h2 style={{ marginTop: 0 }}>Security posture</h2>
        <button
          className="btn"
          type="button"
          onClick={async () => {
            const res = await fetch("/api/security");
            const d = await res.json();
            if (!res.ok) {
              setError(d.error);
              return;
            }
            setMessage(
              `Zero Trust active · AES-256-GCM · rate limits on · backups: ${(d.backups || []).length}`
            );
            setPosture(d);
          }}
        >
          Refresh posture
        </button>
        {posture && (
          <pre style={{ whiteSpace: "pre-wrap", fontSize: "0.8rem", marginTop: "0.75rem" }}>
            {JSON.stringify(posture.zeroTrust, null, 2)}
          </pre>
        )}
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginTop: "0.75rem" }}>
          <button
            className="btn btn-primary"
            type="button"
            onClick={async () => {
              const res = await fetch("/api/security", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "encrypt_demo", text: "patient-phi-sample" }),
              });
              const d = await res.json();
              setMessage(
                res.ok
                  ? `AES-256 roundtrip OK: ${d.matches} · ${String(d.encrypted).slice(0, 48)}…`
                  : d.error
              );
            }}
          >
            Test AES-256 encryption
          </button>
          <button
            className="btn"
            type="button"
            onClick={async () => {
              const res = await fetch("/api/security", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "create_backup" }),
              });
              const d = await res.json();
              setMessage(res.ok ? `Backup created: ${d.backup.filename}` : d.error);
            }}
          >
            Create backup (admin)
          </button>
          <button
            className="btn"
            type="button"
            onClick={async () => {
              const res = await fetch("/api/security", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  action: "report_intrusion",
                  type: "manual_ids_check",
                  severity: "info",
                  details: "User-triggered intrusion detection heartbeat",
                }),
              });
              const d = await res.json();
              setMessage(res.ok ? "IDS event recorded" : d.error);
            }}
          >
            IDS heartbeat
          </button>
        </div>
      </div>

      <div className="panel" style={{ marginBottom: "1.25rem" }}>
        <h2 style={{ marginTop: 0 }}>Two-factor authentication (TOTP)</h2>
        <p className="muted">Status: {twoFactorEnabled ? "Enabled" : "Disabled"}</p>
        {!twoFactorEnabled && (
          <>
            <button className="btn btn-primary" type="button" onClick={setup2fa}>
              Set up 2FA
            </button>
            {setupSecret && (
              <form onSubmit={enable2fa} style={{ marginTop: "1rem" }}>
                <p className="muted" style={{ wordBreak: "break-all" }}>
                  Secret: <code>{setupSecret}</code>
                </p>
                <p className="muted" style={{ wordBreak: "break-all", fontSize: "0.8rem" }}>
                  {otpauthUrl}
                </p>
                <label className="label">Confirm with code</label>
                <input className="input" value={token} onChange={(e) => setToken(e.target.value)} required />
                <button className="btn btn-primary form-submit" type="submit">
                  Enable 2FA
                </button>
              </form>
            )}
          </>
        )}
        {twoFactorEnabled && (
          <form onSubmit={disable2fa} style={{ marginTop: "0.75rem" }}>
            <label className="label">Code to disable</label>
            <input className="input" value={token} onChange={(e) => setToken(e.target.value)} required />
            <button className="btn btn-ghost form-submit" type="submit">
              Disable 2FA
            </button>
          </form>
        )}
      </div>

      <div className="panel">
        <h2 style={{ marginTop: 0 }}>Biometric / passkeys</h2>
        <p className="muted">Uses Face ID, Touch ID, Windows Hello, or a security key via WebAuthn.</p>
        <button className="btn btn-primary" type="button" onClick={registerPasskey}>
          Register this device
        </button>
        <ul style={{ marginTop: "1rem" }}>
          {credentials.map((c) => (
            <li key={c.id} style={{ marginBottom: "0.5rem" }}>
              {c.nickname || "Passkey"} · {c.deviceType || "unknown"}{" "}
              <button className="btn btn-ghost" type="button" onClick={() => deleteCred(c.id)}>
                Remove
              </button>
            </li>
          ))}
          {credentials.length === 0 && <li className="muted">No passkeys registered yet.</li>}
        </ul>
      </div>
    </PageShell>
  );
}
