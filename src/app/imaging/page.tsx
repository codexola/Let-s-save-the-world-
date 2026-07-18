"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { PageShell } from "@/components/page-shell";

type Img = {
  id: string;
  modality: string;
  title: string;
  bodyPart: string | null;
  imageUrl: string | null;
  aiAnalysis: string | null;
  annotationsJson: string | null;
  measurementsJson: string | null;
  comparisonImageId: string | null;
  shareToken: string | null;
  secondOpinionStatus: string | null;
  secondOpinionNotes: string | null;
  patient?: { name: string };
  studyDate?: string;
};

type Annotation = { id: string; x: number; y: number; text: string };
type Measurement = { id: string; x1: number; y1: number; x2: number; y2: number; mm: number };

export default function ImagingPage() {
  const [modalities, setModalities] = useState<string[]>([]);
  const [modality, setModality] = useState("");
  const [images, setImages] = useState<Img[]>([]);
  const [active, setActive] = useState<Img | null>(null);
  const [compare, setCompare] = useState<Img | null>(null);
  const [zoom, setZoom] = useState(1);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  const [mode, setMode] = useState<"pan" | "annotate" | "measure">("pan");
  const [measureStart, setMeasureStart] = useState<{ x: number; y: number } | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [shareUrl, setShareUrl] = useState("");
  const viewerRef = useRef<HTMLDivElement>(null);

  async function load() {
    const params = new URLSearchParams();
    if (modality) params.set("modality", modality);
    const res = await fetch(`/api/imaging?${params}`);
    const d = await res.json();
    if (!res.ok) {
      setError(d.error || "Sign in required");
      return;
    }
    setImages(d.images || []);
    setModalities(d.modalities || []);
  }

  useEffect(() => {
    load();
  }, [modality]);

  useEffect(() => {
    if (!active) return;
    setAnnotations(active.annotationsJson ? JSON.parse(active.annotationsJson) : []);
    setMeasurements(active.measurementsJson ? JSON.parse(active.measurementsJson) : []);
    setZoom(1);
    setShareUrl("");
    if (active.comparisonImageId) {
      const c = images.find((i) => i.id === active.comparisonImageId);
      setCompare(c || null);
    } else setCompare(null);
  }, [active, images]);

  const downloadHref = useMemo(() => active?.imageUrl || "", [active]);

  async function openImage(id: string) {
    const res = await fetch(`/api/imaging?id=${id}`);
    const d = await res.json();
    if (res.ok) {
      setActive(d.image);
      if (d.comparison) setCompare(d.comparison);
    }
  }

  function onViewerClick(e: React.MouseEvent) {
    if (!active || !viewerRef.current) return;
    const rect = viewerRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    if (mode === "annotate") {
      const text = window.prompt("Annotation text");
      if (!text) return;
      const next = [...annotations, { id: crypto.randomUUID(), x, y, text }];
      setAnnotations(next);
      fetch("/api/imaging", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "annotate", id: active.id, annotations: next }),
      });
    }
    if (mode === "measure") {
      if (!measureStart) {
        setMeasureStart({ x, y });
        return;
      }
      const dx = x - measureStart.x;
      const dy = y - measureStart.y;
      const mm = Math.round(Math.sqrt(dx * dx + dy * dy) * 1.2 * 10) / 10;
      const next = [
        ...measurements,
        { id: crypto.randomUUID(), x1: measureStart.x, y1: measureStart.y, x2: x, y2: y, mm },
      ];
      setMeasurements(next);
      setMeasureStart(null);
      fetch("/api/imaging", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "measure", id: active.id, measurements: next }),
      });
    }
  }

  async function createStudy(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const res = await fetch("/api/imaging", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "create",
        modality: fd.get("modality"),
        title: fd.get("title"),
        bodyPart: fd.get("bodyPart"),
      }),
    });
    const d = await res.json();
    if (!res.ok) {
      setError(d.error);
      return;
    }
    setMessage(`Created ${d.image.title}`);
    load();
    setActive(d.image);
  }

  return (
    <PageShell
      eyebrow="Diagnostics"
      title="Medical imaging"
      description="X-Ray · CT · MRI · PET · Ultrasound · Mammography · Dental · Eye · Pathology — viewer with zoom, annotation, measurement, comparison, AI, secure share, second opinion."
    >
      {error && <p className="error-text">{error}</p>}
      {message && <p className="muted">{message}</p>}

      <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap", marginBottom: "1rem" }}>
        <button className={!modality ? "btn btn-primary" : "btn btn-ghost"} type="button" onClick={() => setModality("")}>
          All
        </button>
        {modalities.map((m) => (
          <button
            key={m}
            className={modality === m ? "btn btn-primary" : "btn btn-ghost"}
            type="button"
            onClick={() => setModality(m)}
          >
            {m}
          </button>
        ))}
      </div>

      <form className="panel form-narrow" onSubmit={createStudy} style={{ marginBottom: "1rem" }}>
        <h3 style={{ marginTop: 0 }}>New study</h3>
        <label className="label">Modality</label>
        <select className="input" name="modality" defaultValue="X-Ray">
          {modalities.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        <label className="label">Title</label>
        <input className="input" name="title" required placeholder="Chest PA" />
        <label className="label">Body part</label>
        <input className="input" name="bodyPart" placeholder="Chest" />
        <button className="btn btn-primary form-submit" type="submit">
          Create study
        </button>
      </form>

      <div className="feature-grid" style={{ marginBottom: "1rem" }}>
        {images.map((img) => (
          <button
            key={img.id}
            type="button"
            className="panel"
            style={{ textAlign: "left", cursor: "pointer", border: active?.id === img.id ? "2px solid #0ea5e9" : undefined }}
            onClick={() => openImage(img.id)}
          >
            <p className="badge">{img.modality}</p>
            <strong>{img.title}</strong>
            <p className="muted">{img.bodyPart}</p>
            {img.secondOpinionStatus && <p className="muted">2nd opinion: {img.secondOpinionStatus}</p>}
          </button>
        ))}
      </div>

      {active && (
        <div className="panel">
          <h2 style={{ marginTop: 0 }}>
            Viewer — {active.modality}: {active.title}
          </h2>
          <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", marginBottom: "0.75rem" }}>
            <button className="btn" type="button" onClick={() => setZoom((z) => Math.min(3, z + 0.25))}>
              Zoom +
            </button>
            <button className="btn" type="button" onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))}>
              Zoom −
            </button>
            <button className={mode === "annotate" ? "btn btn-primary" : "btn"} type="button" onClick={() => setMode("annotate")}>
              Annotate
            </button>
            <button className={mode === "measure" ? "btn btn-primary" : "btn"} type="button" onClick={() => setMode("measure")}>
              Measure
            </button>
            <button className="btn" type="button" onClick={() => setMode("pan")}>
              Pan mode
            </button>
            <button
              className="btn"
              type="button"
              onClick={async () => {
                const other = images.find((i) => i.id !== active.id && i.modality === active.modality) || images.find((i) => i.id !== active.id);
                if (!other) return;
                await fetch("/api/imaging", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ action: "compare", id: active.id, comparisonImageId: other.id }),
                });
                setCompare(other);
                setMessage(`Comparing with ${other.title}`);
              }}
            >
              Compare
            </button>
            <button
              className="btn btn-primary"
              type="button"
              onClick={async () => {
                const res = await fetch("/api/imaging", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ action: "ai_analyze", id: active.id }),
                });
                const d = await res.json();
                if (d.image) setActive(d.image);
                setMessage("AI analysis updated");
              }}
            >
              AI analysis
            </button>
            <a className="btn" href={downloadHref} download={`${active.modality}-${active.id}.svg`}>
              Download
            </a>
            <button
              className="btn"
              type="button"
              onClick={async () => {
                const res = await fetch("/api/imaging", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ action: "share", id: active.id }),
                });
                const d = await res.json();
                if (d.shareUrl) {
                  setShareUrl(d.shareUrl);
                  setMessage("Secure share link created (expires)");
                }
              }}
            >
              Share securely
            </button>
            <button
              className="btn"
              type="button"
              onClick={async () => {
                const res = await fetch("/api/imaging", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    action: "second_opinion",
                    id: active.id,
                    notes: "Please review for second opinion.",
                  }),
                });
                const d = await res.json();
                if (d.image) setActive(d.image);
                setMessage("Second-opinion request sent to doctor");
              }}
            >
              Request second opinion
            </button>
          </div>

          {shareUrl && <p className="muted">Share: {shareUrl}</p>}

          <div style={{ display: "grid", gridTemplateColumns: compare ? "1fr 1fr" : "1fr", gap: "0.75rem" }}>
            <div
              ref={viewerRef}
              onClick={onViewerClick}
              style={{
                position: "relative",
                overflow: "auto",
                background: "#0f172a",
                borderRadius: 8,
                minHeight: 360,
                cursor: mode === "pan" ? "grab" : "crosshair",
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={active.imageUrl || ""}
                alt={active.title}
                style={{
                  width: `${zoom * 100}%`,
                  display: "block",
                  transformOrigin: "top left",
                }}
              />
              {annotations.map((a) => (
                <span
                  key={a.id}
                  style={{
                    position: "absolute",
                    left: `${a.x}%`,
                    top: `${a.y}%`,
                    background: "rgba(14,165,233,0.9)",
                    color: "#fff",
                    fontSize: 12,
                    padding: "2px 6px",
                    borderRadius: 4,
                    transform: "translate(-50%, -50%)",
                  }}
                >
                  {a.text}
                </span>
              ))}
              <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}>
                {measurements.map((m) => (
                  <g key={m.id}>
                    <line
                      x1={`${m.x1}%`}
                      y1={`${m.y1}%`}
                      x2={`${m.x2}%`}
                      y2={`${m.y2}%`}
                      stroke="#fbbf24"
                      strokeWidth="2"
                    />
                    <text x={`${(m.x1 + m.x2) / 2}%`} y={`${(m.y1 + m.y2) / 2}%`} fill="#fbbf24" fontSize="12">
                      {m.mm} mm
                    </text>
                  </g>
                ))}
              </svg>
            </div>
            {compare && (
              <div style={{ background: "#0f172a", borderRadius: 8, minHeight: 360, overflow: "auto" }}>
                <p className="muted" style={{ padding: "0.5rem", margin: 0 }}>
                  Comparison: {compare.title}
                </p>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={compare.imageUrl || ""} alt={compare.title} style={{ width: "100%" }} />
              </div>
            )}
          </div>

          {active.aiAnalysis && (
            <div style={{ marginTop: "1rem" }}>
              <p className="badge">AI-assisted analysis</p>
              <p>{active.aiAnalysis}</p>
            </div>
          )}
          {active.secondOpinionStatus && (
            <p className="muted">
              Second opinion: {active.secondOpinionStatus} — {active.secondOpinionNotes}
            </p>
          )}
        </div>
      )}
    </PageShell>
  );
}
