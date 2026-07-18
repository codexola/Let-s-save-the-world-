"use client";

import { FormEvent, useEffect, useState } from "react";
import { PageShell } from "@/components/page-shell";

export default function EnterprisePage() {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function load() {
    const res = await fetch("/api/enterprise");
    const d = await res.json();
    if (!res.ok) setError(d.error || "Access denied");
    else setData(d);
  }

  useEffect(() => {
    load();
  }, []);

  const org = data?.organization as { name: string; code: string } | undefined;
  const orgs = (data?.multiOrganization || []) as Array<{ id: string; name: string; code: string }>;
  const hierarchy = (data?.departmentHierarchy || []) as Array<{ name: string; children: Array<{ name: string }> }>;
  const rbac = (data?.roleBasedPermissions || []) as Array<{ user: string; orgRole: string; platformRole: string; department: string | null }>;
  const sso = (data?.singleSignOn || []) as Array<{ protocol: string; provider: string; enabled: boolean }>;
  const analytics = data?.organizationAnalytics as Record<string, unknown> | undefined;
  const workflows = (data?.customWorkflows || []) as Array<{ name: string; trigger: string; steps: unknown[] }>;
  const approvals = (data?.approvalChains || []) as Array<{ id: string; title: string; status: string; requester: { name: string } }>;
  const budgets = (data?.budgetManagement || []) as Array<{ category: string; amountYen: number; spentYen: number; fiscalYear: number }>;
  const contracts = (data?.contractManagement || []) as Array<{ vendor: string; title: string; valueYen: number; status: string }>;
  const licenses = (data?.licenseManagement || []) as Array<{ product: string; seats: number; usedSeats: number; status: string }>;

  return (
    <PageShell
      eyebrow="Enterprise"
      title="Enterprise administration"
      description="Multi-organization · department hierarchy · RBAC · SSO (SAML/OIDC) · org analytics · workflows · approval chains · budgets · contracts · licenses."
    >
      {error && <p className="error-text">{error}</p>}
      {message && <p className="muted">{message}</p>}

      {org && (
        <div className="panel" style={{ marginBottom: "1rem" }}>
          <h3 style={{ marginTop: 0 }}>
            {org.name} <span className="badge">{org.code}</span>
          </h3>
        </div>
      )}

      <form
        className="panel form-narrow"
        style={{ marginBottom: "1rem" }}
        onSubmit={async (e: FormEvent) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget as HTMLFormElement);
          const res = await fetch("/api/enterprise", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "create_org",
              name: fd.get("name"),
              code: fd.get("code"),
            }),
          });
          const d = await res.json();
          setMessage(res.ok ? `Org ${d.organization.code} created` : d.error);
          load();
        }}
      >
        <h3 style={{ marginTop: 0 }}>Add organization</h3>
        <input className="input" name="name" required placeholder="Organization name" />
        <input className="input" name="code" required placeholder="CODE" />
        <button className="btn btn-primary form-submit" type="submit">
          Create
        </button>
      </form>

      <h3>Multi-organization</h3>
      {orgs.map((o) => (
        <p key={o.id}>
          {o.name} ({o.code})
        </p>
      ))}

      <h3>Department hierarchy</h3>
      {hierarchy.map((h) => (
        <div key={h.name} className="panel" style={{ marginBottom: "0.5rem" }}>
          <strong>{h.name}</strong>
          <ul>
            {h.children.map((c) => (
              <li key={c.name}>{c.name}</li>
            ))}
          </ul>
        </div>
      ))}

      <h3>Role-based permissions</h3>
      {rbac.map((r, i) => (
        <p key={i} className="muted">
          {r.user}: org {r.orgRole} · platform {r.platformRole} · {r.department || "—"}
        </p>
      ))}

      <h3>Single Sign-On (SAML / OIDC)</h3>
      {sso.map((s, i) => (
        <p key={i}>
          {s.protocol} via {s.provider} — {s.enabled ? "enabled" : "disabled"}
        </p>
      ))}

      <h3>Organization-wide analytics</h3>
      <pre className="panel" style={{ whiteSpace: "pre-wrap", fontSize: "0.85rem" }}>
        {JSON.stringify(analytics, null, 2)}
      </pre>

      <h3>Custom workflows</h3>
      {workflows.map((w) => (
        <p key={w.name}>
          {w.name} (trigger: {w.trigger}) — {w.steps.length} steps
        </p>
      ))}

      <h3>Approval chains</h3>
      {approvals.map((a) => (
        <div key={a.id} style={{ marginBottom: "0.4rem" }}>
          {a.title} — {a.status} (by {a.requester.name}){" "}
          {a.status === "pending" && (
            <button
              className="btn"
              type="button"
              onClick={async () => {
                await fetch("/api/enterprise", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ action: "decide_approval", approvalId: a.id, decision: "approved" }),
                });
                setMessage("Approval decided");
                load();
              }}
            >
              Approve
            </button>
          )}
        </div>
      ))}

      <h3>Budget management</h3>
      {budgets.map((b) => (
        <p key={b.category}>
          {b.category} FY{b.fiscalYear}: ¥{b.spentYen.toLocaleString()} / ¥{b.amountYen.toLocaleString()}
        </p>
      ))}

      <h3>Contract management</h3>
      {contracts.map((c) => (
        <p key={c.title}>
          {c.vendor}: {c.title} — ¥{c.valueYen.toLocaleString()} ({c.status})
        </p>
      ))}

      <h3>License management</h3>
      {licenses.map((l) => (
        <p key={l.product}>
          {l.product}: {l.usedSeats}/{l.seats} seats ({l.status})
        </p>
      ))}
    </PageShell>
  );
}
