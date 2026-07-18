"use client";

import { FormEvent, useEffect, useState } from "react";

export type ProfileFieldDef = {
  key: string;
  label: string;
  type: "string" | "number" | "boolean" | "textarea";
  readOnly?: boolean;
  placeholder?: string;
};

type ProfileFormProps = {
  title: string;
  action: string;
  fields: ProfileFieldDef[];
  initialValues: Record<string, unknown>;
  extraPayload?: Record<string, unknown>;
  onSaved?: (data: unknown) => void;
};

export function ProfileForm({
  title,
  action,
  fields,
  initialValues,
  extraPayload,
  onSaved,
}: ProfileFormProps) {
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const next: Record<string, unknown> = {};
    for (const f of fields) {
      next[f.key] = initialValues[f.key] ?? (f.type === "boolean" ? false : f.type === "number" ? 0 : "");
    }
    setValues(next);
  }, [fields, initialValues]);

  function setField(key: string, value: unknown) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage("");
    try {
      const payload: Record<string, unknown> = { action, ...extraPayload };
      for (const f of fields) {
        if (f.readOnly) continue;
        payload[f.key] = values[f.key];
      }
      const res = await fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error || "Save failed");
        return;
      }
      setMessage("Saved");
      onSaved?.(data);
    } catch {
      setMessage("Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="panel" onSubmit={handleSubmit}>
      <h2 className="section-title" style={{ marginTop: 0 }}>
        {title}
      </h2>
      {fields.map((f) => (
        <div key={f.key} style={{ marginBottom: "0.75rem" }}>
          <label className="label">{f.label}</label>
          {f.type === "boolean" ? (
            f.readOnly ? (
              <span className="badge">{values[f.key] ? "Yes" : "No"}</span>
            ) : (
              <label style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <input
                  type="checkbox"
                  checked={Boolean(values[f.key])}
                  onChange={(e) => setField(f.key, e.target.checked)}
                />
                <span className="muted">{values[f.key] ? "Enabled" : "Disabled"}</span>
              </label>
            )
          ) : f.type === "textarea" ? (
            <textarea
              className="input"
              rows={4}
              value={String(values[f.key] ?? "")}
              readOnly={f.readOnly}
              placeholder={f.placeholder}
              onChange={(e) => setField(f.key, e.target.value)}
            />
          ) : (
            <input
              className="input"
              type={f.type === "number" ? "number" : "text"}
              value={String(values[f.key] ?? "")}
              readOnly={f.readOnly}
              placeholder={f.placeholder}
              onChange={(e) =>
                setField(f.key, f.type === "number" ? Number(e.target.value) : e.target.value)
              }
            />
          )}
        </div>
      ))}
      {!fields.every((f) => f.readOnly) && (
        <button className="btn btn-primary" type="submit" disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </button>
      )}
      {message && (
        <p className="muted" style={{ marginTop: "0.75rem" }}>
          {message}
        </p>
      )}
    </form>
  );
}
