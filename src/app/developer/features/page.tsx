"use client";

import { useEffect, useState } from "react";
import { PageShell } from "@/components/page-shell";

type Feature = { id: string; name: string; key: string; enabled: boolean; category: string };

export default function DeveloperFeaturesPage() {
  const [features, setFeatures] = useState<Feature[]>([]);
  const [msg, setMsg] = useState("");

  async function load() {
    const res = await fetch("/api/features");
    if (res.ok) setFeatures((await res.json()).features || []);
  }

  useEffect(() => {
    load();
  }, []);

  async function toggle(id: string, enabled: boolean) {
    const res = await fetch("/api/features", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "toggle", id, enabled }),
    });
    setMsg(res.ok ? "Updated" : (await res.json()).error);
    load();
  }

  return (
    <PageShell eyebrow="Developer" title="Feature flags" description="Toggle platform modules.">
      {msg && <p className="muted">{msg}</p>}
      <div className="panel">
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Key</th>
              <th>On</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {features.map((f) => (
              <tr key={f.id}>
                <td>{f.name}</td>
                <td>{f.key}</td>
                <td>{f.enabled ? "Yes" : "No"}</td>
                <td>
                  <button
                    className={`toggle ${f.enabled ? "on" : ""}`}
                    type="button"
                    onClick={() => toggle(f.id, !f.enabled)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </PageShell>
  );
}
