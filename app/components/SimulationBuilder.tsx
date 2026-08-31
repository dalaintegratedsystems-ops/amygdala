"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { isAcceptableTarget, normaliseOrigin, publishBlockedReason, simulationSandboxTokens } from "../lib/simbuilder.mjs";
import type { SimulationDefinition, SimulationScreen, SimulationStep, SimOrigin } from "./types";

// Vendor SaaS simulation builder (admin). "Connect your product": paste a
// sandbox URL, we probe embeddability, and you author a guided overlay
// (ordered steps + hotspots + coaching). Non-embeddable targets fall back to a
// screenshot walkthrough (upload screens, place hotspots) — no vendor infra.

const uid = () => (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `s-${Math.random().toString(36).slice(2)}`);

type Probe = { embeddable: boolean; reason: string; recommend?: string; status?: number };

function emptyDraft(): SimulationDefinition {
  return { id: "", title: "", description: "", mode: "iframe", targetUrl: "", embeddable: true, bridgeEnabled: false, status: "Draft", steps: [], screens: [] };
}

function newStep(screenIndex = 0): SimulationStep {
  return { id: uid(), label: "", coaching: "", hotspot: { x: 40, y: 40, w: 16, h: 8 }, screenIndex, match: null };
}

export function SimulationBuilder() {
  const [simulations, setSimulations] = useState<SimulationDefinition[]>([]);
  const [origins, setOrigins] = useState<SimOrigin[]>([]);
  const [draft, setDraft] = useState<SimulationDefinition>(emptyDraft());
  const [selectedId, setSelectedId] = useState("");
  const [activeStep, setActiveStep] = useState(0);
  const [probe, setProbe] = useState<Probe | null>(null);
  const [probing, setProbing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [newOrigin, setNewOrigin] = useState("");
  const [placing, setPlacing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const screenInput = useRef<HTMLInputElement>(null);

  function fetchLibrary() {
    return Promise.all([
      fetch("/api/simulations").then((response) => (response.ok ? response.json() : { simulations: [] })).catch(() => ({ simulations: [] })),
      fetch("/api/simulations/origins").then((response) => (response.ok ? response.json() : { origins: [] })).catch(() => ({ origins: [] })),
    ]);
  }
  function applyLibrary([sims, origs]: [{ simulations?: SimulationDefinition[] }, { origins?: SimOrigin[] }]) {
    setSimulations(sims.simulations ?? []);
    setOrigins(origs.origins ?? []);
  }
  async function reload() { applyLibrary(await fetchLibrary()); }
  useEffect(() => { let active = true; fetchLibrary().then((data) => { if (active) applyLibrary(data); }); return () => { active = false; }; }, []);

  function edit(simulation: SimulationDefinition) {
    setDraft({ ...simulation, steps: simulation.steps.map((step) => ({ ...step })), screens: simulation.screens.map((screen) => ({ ...screen })) });
    setSelectedId(simulation.id);
    setActiveStep(0);
    setProbe(null);
    setStatus("");
    setError("");
  }
  function startNew() {
    setDraft(emptyDraft());
    setSelectedId("");
    setActiveStep(0);
    setProbe(null);
    setStatus("");
    setError("");
  }

  function update(patch: Partial<SimulationDefinition>) { setDraft((current) => ({ ...current, ...patch })); setStatus(""); }
  function updateStep(index: number, patch: Partial<SimulationStep>) {
    setDraft((current) => ({ ...current, steps: current.steps.map((step, i) => (i === index ? { ...step, ...patch } : step)) }));
  }
  function updateHotspot(index: number, patch: Partial<NonNullable<SimulationStep["hotspot"]>>) {
    setDraft((current) => ({ ...current, steps: current.steps.map((step, i) => (i === index ? { ...step, hotspot: { x: 40, y: 40, w: 16, h: 8, ...(step.hotspot ?? {}), ...patch } } : step)) }));
  }
  function addStep() { setDraft((current) => ({ ...current, steps: [...current.steps, newStep(current.mode === "screenshot" ? Math.max(0, current.screens.length - 1) : 0)] })); setActiveStep(draft.steps.length); }
  function removeStep(index: number) { setDraft((current) => ({ ...current, steps: current.steps.filter((_, i) => i !== index) })); setActiveStep(0); }
  function moveStep(index: number, direction: -1 | 1) {
    setDraft((current) => {
      const next = index + direction;
      if (next < 0 || next >= current.steps.length) return current;
      const steps = [...current.steps];
      [steps[index], steps[next]] = [steps[next], steps[index]];
      return { ...current, steps };
    });
  }

  async function runProbe() {
    if (!draft.targetUrl) return;
    setProbing(true); setProbe(null);
    try {
      const response = await fetch("/api/simulations/probe", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url: draft.targetUrl }) });
      const data = (await response.json()) as Probe;
      setProbe(data);
      // Reflect the probe outcome into the definition so the runtime picks the
      // right rendering path.
      update({ embeddable: data.embeddable, ...(data.embeddable ? {} : { mode: "screenshot" as const }) });
    } catch {
      setProbe({ embeddable: false, reason: "probe-failed", recommend: "screenshot" });
    } finally { setProbing(false); }
  }

  async function uploadScreen(file?: File) {
    if (!file) return;
    setUploading(true); setError("");
    try {
      const form = new FormData();
      form.append("file", file);
      const response = await fetch("/api/media", { method: "POST", body: form });
      if (!response.ok) { const data = await response.json().catch(() => ({})); throw new Error(data.error ?? "Upload failed"); }
      const data = (await response.json()) as { key: string; url: string };
      const screen: SimulationScreen = { key: data.key, url: data.url, alt: file.name.replace(/\.[^.]+$/, ""), width: null, height: null };
      setDraft((current) => ({ ...current, screens: [...current.screens, screen] }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Upload failed");
    } finally { setUploading(false); }
  }
  function removeScreen(index: number) { setDraft((current) => ({ ...current, screens: current.screens.filter((_, i) => i !== index) })); }

  async function save(publish?: boolean) {
    if (publish) {
      const blocked = publishBlockedReason(draft);
      if (blocked) { setError(blocked); return; }
    }
    setSaving(true); setStatus(""); setError("");
    const payload = { ...draft, status: publish ? "Published" : draft.status };
    try {
      const response = selectedId
        ? await fetch("/api/simulations", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...payload, id: selectedId }) })
        : await fetch("/api/simulations", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      if (!response.ok) { const data = await response.json().catch(() => ({})); throw new Error(data.error ?? "Save failed"); }
      const data = (await response.json()) as { simulation: SimulationDefinition };
      setStatus(publish ? "Published to learners." : "Saved.");
      await reload();
      edit(data.simulation);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Save failed");
    } finally { setSaving(false); }
  }

  async function remove() {
    if (!selectedId) { startNew(); return; }
    setSaving(true);
    try {
      await fetch(`/api/simulations?id=${encodeURIComponent(selectedId)}`, { method: "DELETE" });
      await reload();
      startNew();
    } finally { setSaving(false); }
  }

  async function addOrigin() {
    const origin = normaliseOrigin(newOrigin);
    if (!origin) { setError("Enter a valid https origin, e.g. https://sandbox.example.com"); return; }
    const response = await fetch("/api/simulations/origins", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ origin }) });
    if (response.ok) { setNewOrigin(""); await reload(); }
  }
  async function removeOrigin(id: string) {
    await fetch(`/api/simulations/origins?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    await reload();
  }

  const targetOk = draft.mode !== "iframe" || isAcceptableTarget(draft.targetUrl).ok;
  const publishBlock = publishBlockedReason(draft);
  const previewOrigin = normaliseOrigin(draft.targetUrl);
  const originAllowed = previewOrigin ? origins.some((entry) => entry.origin === previewOrigin) : false;
  const canPreviewIframe = draft.mode === "iframe" && draft.embeddable && targetOk;
  const sandbox = useMemo(() => simulationSandboxTokens().join(" "), []);
  const step = draft.steps[activeStep];
  const activeScreen = draft.screens[step?.screenIndex ?? 0];

  function placeHotspot(event: React.MouseEvent<HTMLElement>) {
    if (!placing || !step) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = Math.max(0, Math.min(100, ((event.clientX - rect.left) / rect.width) * 100));
    const y = Math.max(0, Math.min(100, ((event.clientY - rect.top) / rect.height) * 100));
    updateHotspot(activeStep, { x: Math.round(x - (step.hotspot?.w ?? 16) / 2), y: Math.round(y - (step.hotspot?.h ?? 8) / 2) });
    setPlacing(false);
  }

  return (
    <div className="page-content sim-builder">
      <div className="page-heading">
        <div><span className="eyebrow">Vendor product simulations</span><h1>Connect your product</h1><p>Turn your SaaS sandbox into a safe, guided training simulation. Paste a sandbox URL to embed it, or upload screenshots for a walkthrough — no production access, ever.</p></div>
        <button type="button" className="button button-primary" onClick={startNew}>New simulation <span>＋</span></button>
      </div>

      <div className="sim-builder-layout">
        <aside className="panel sim-list">
          <div className="panel-header"><div><span className="tiny-label">Your simulations</span><h2>Library</h2></div></div>
          {simulations.length === 0 ? <p className="model-note">No simulations yet. Create one from a sandbox URL or screenshots.</p> : (
            <div className="sim-list-items">
              {simulations.map((simulation) => (
                <button type="button" key={simulation.id} className={selectedId === simulation.id ? "selected" : ""} onClick={() => edit(simulation)}>
                  <span className={`sim-mode-dot ${simulation.mode}`} aria-hidden="true" />
                  <span><strong>{simulation.title}</strong><small>{simulation.mode === "iframe" ? "Embed" : "Walkthrough"} · {simulation.steps.length} steps</small></span>
                  <span className={`status-pill ${simulation.status === "Published" ? "published" : "draft"}`}><i />{simulation.status}</span>
                </button>
              ))}
            </div>
          )}
          <div className="sim-allowlist">
            <span className="tiny-label">Embeddable origins allow-list</span>
            <p className="model-note">Only these origins can be embedded in the simulator. Creating an iframe simulation adds its origin automatically.</p>
            <div className="sim-origin-add">
              <input aria-label="Allow-list origin" value={newOrigin} onChange={(event) => setNewOrigin(event.target.value)} placeholder="https://sandbox.example.com" />
              <button type="button" className="button button-secondary button-small" onClick={addOrigin}>Add</button>
            </div>
            <ul className="sim-origin-list">
              {origins.length === 0 && <li className="model-note">No origins allow-listed yet.</li>}
              {origins.map((entry) => <li key={entry.id}><code>{entry.origin}</code><button type="button" className="text-button" onClick={() => removeOrigin(entry.id)} aria-label={`Remove ${entry.origin}`}>✕</button></li>)}
            </ul>
          </div>
        </aside>

        <section className="panel sim-editor">
          <div className="panel-header"><div><span className="tiny-label">{selectedId ? "Edit simulation" : "New simulation"}</span><h2>{draft.title || "Untitled simulation"}</h2></div><span className={`status-pill ${draft.status === "Published" ? "published" : "draft"}`}><i />{draft.status}</span></div>

          <div className="sim-editor-fields">
            <label className="studio-field"><span className="tiny-label">Title</span><input aria-label="Simulation title" value={draft.title} onChange={(event) => update({ title: event.target.value })} placeholder="e.g. Create your first invoice" /></label>
            <label className="studio-field"><span className="tiny-label">Description</span><input aria-label="Simulation description" value={draft.description} onChange={(event) => update({ description: event.target.value })} placeholder="What the learner practises" /></label>

            <div className="sim-mode-toggle" role="group" aria-label="Simulation mode">
              <button type="button" className={draft.mode === "iframe" ? "active" : ""} onClick={() => update({ mode: "iframe" })}><strong>Embed sandbox</strong><small>Frame a live sandbox URL</small></button>
              <button type="button" className={draft.mode === "screenshot" ? "active" : ""} onClick={() => update({ mode: "screenshot" })}><strong>Screenshot walkthrough</strong><small>Upload screens, place hotspots</small></button>
            </div>

            {draft.mode === "iframe" && (
              <div className="sim-iframe-config">
                <label className="studio-field"><span className="tiny-label">Sandbox target URL</span><input aria-label="Sandbox target URL" value={draft.targetUrl} onChange={(event) => { update({ targetUrl: event.target.value }); setProbe(null); }} placeholder="https://sandbox.example.com/app" /></label>
                <div className="sim-probe-row">
                  <button type="button" className="button button-secondary button-small" onClick={runProbe} disabled={probing || !targetOk}>{probing ? "Testing…" : "Test embeddability"}</button>
                  <label className="sim-bridge-toggle"><input type="checkbox" checked={draft.bridgeEnabled} onChange={(event) => update({ bridgeEnabled: event.target.checked })} /> postMessage bridge (auto-advance)</label>
                </div>
                {!targetOk && draft.targetUrl && <p className="signin-error" role="alert">Target must be an https URL (http allowed only for localhost).</p>}
                {probe && (
                  <div className={`sim-probe-result ${probe.embeddable ? "ok" : "warn"}`}>
                    {probe.embeddable ? <span>✓ Embeddable — this target can run in a sandboxed iframe.</span> : <span>⚠ Not embeddable ({probe.reason}). Switched to a screenshot walkthrough — upload screens below.</span>}
                  </div>
                )}
                {previewOrigin && !originAllowed && <p className="model-note">Origin <code>{previewOrigin}</code> will be added to your allow-list on save.</p>}
              </div>
            )}

            {draft.mode === "screenshot" && (
              <div className="sim-screens-config">
                <div className="sim-screens-head"><span className="tiny-label">Screens</span><input ref={screenInput} type="file" accept="image/png,image/jpeg,image/webp" className="visually-hidden-file" onChange={(event) => uploadScreen(event.target.files?.[0])} aria-label="Upload screen" /><button type="button" className="button button-secondary button-small" onClick={() => screenInput.current?.click()} disabled={uploading}>{uploading ? "Uploading…" : "Upload screen"}</button></div>
                <div className="sim-screen-thumbs">
                  {draft.screens.length === 0 && <p className="model-note">Upload one or more screenshots of your product to build a walkthrough.</p>}
                  {draft.screens.map((screen, index) => (
                    <div className="sim-screen-thumb" key={screen.key || index}>
                      {/* eslint-disable-next-line @next/next/no-img-element -- dynamic R2 upload */}
                      <img src={screen.url || `/api/media?key=${encodeURIComponent(screen.key)}`} alt={screen.alt} />
                      <input aria-label={`Screen ${index + 1} alt text`} value={screen.alt} onChange={(event) => setDraft((current) => ({ ...current, screens: current.screens.map((s, i) => (i === index ? { ...s, alt: event.target.value } : s)) }))} placeholder="Alt text" />
                      <button type="button" className="text-button" onClick={() => removeScreen(index)}>Remove screen {index + 1}</button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="sim-steps-editor">
            <div className="sim-steps-head"><span className="tiny-label">Guided steps · hotspots + coaching</span><button type="button" className="button button-secondary button-small" onClick={addStep}>＋ Add step</button></div>
            {draft.steps.length === 0 && <p className="model-note">Add ordered steps. Each step highlights a hotspot and shows coaching to guide the learner.</p>}
            {draft.steps.map((entry, index) => (
              <div className={`sim-step-row ${activeStep === index ? "active" : ""}`} key={entry.id} onFocusCapture={() => setActiveStep(index)}>
                <div className="sim-step-head"><span className="sim-step-index">{index + 1}</span>
                  <span className="block-controls">
                    <button type="button" className="icon-button" onClick={() => moveStep(index, -1)} aria-label="Move step up">↑</button>
                    <button type="button" className="icon-button" onClick={() => moveStep(index, 1)} aria-label="Move step down">↓</button>
                    <button type="button" className="icon-button" onClick={() => removeStep(index)} aria-label="Remove step">✕</button>
                  </span>
                </div>
                <input aria-label={`Step ${index + 1} label`} value={entry.label} onChange={(event) => updateStep(index, { label: event.target.value })} placeholder="What to do (e.g. Open Billing)" />
                <input aria-label={`Step ${index + 1} coaching`} value={entry.coaching} onChange={(event) => updateStep(index, { coaching: event.target.value })} placeholder="Coaching / where to look" />
                <div className="sim-step-meta">
                  {draft.mode === "screenshot" && (
                    <label>Screen <select aria-label={`Step ${index + 1} screen`} value={entry.screenIndex} onChange={(event) => updateStep(index, { screenIndex: Number(event.target.value) })}>{draft.screens.map((_, i) => <option key={i} value={i}>{i + 1}</option>)}</select></label>
                  )}
                  {draft.bridgeEnabled && draft.mode === "iframe" && (
                    <label>Bridge event <input aria-label={`Step ${index + 1} bridge event`} value={entry.match?.event ?? ""} onChange={(event) => updateStep(index, { match: event.target.value ? { event: event.target.value } : null })} placeholder="e.g. invoice.created" /></label>
                  )}
                  <span className="sim-hotspot-coords">Hotspot: {Math.round(entry.hotspot?.x ?? 0)},{Math.round(entry.hotspot?.y ?? 0)} · {Math.round(entry.hotspot?.w ?? 0)}×{Math.round(entry.hotspot?.h ?? 0)}</span>
                </div>
              </div>
            ))}
          </div>

          <div className="sim-preview">
            <div className="sim-preview-head"><span className="tiny-label">Preview {step ? `· step ${activeStep + 1}` : ""}</span>{step && <button type="button" className={`button button-secondary button-small ${placing ? "active" : ""}`} onClick={() => setPlacing((value) => !value)}>{placing ? "Click the preview to place…" : "Place hotspot"}</button>}</div>
            <div className="sim-preview-stage">
              <div className="sim-chrome"><span className="sim-flag">SIMULATION — not production</span><strong>{draft.title || "Preview"}</strong></div>
              {canPreviewIframe && previewOrigin ? (
                <div className="sim-frame-wrap">
                  <iframe title="Simulation preview" src={draft.targetUrl} sandbox={sandbox} referrerPolicy="no-referrer" className="sim-frame" />
                  {step?.hotspot && <div className="sim-hotspot" aria-hidden="true" style={{ "--hx": `${step.hotspot.x}%`, "--hy": `${step.hotspot.y}%`, "--hw": `${step.hotspot.w}%`, "--hh": `${step.hotspot.h}%` } as React.CSSProperties} />}
                  {placing && <button type="button" className="sim-place-overlay" onClick={placeHotspot} aria-label="Click to place the hotspot for this step" />}
                </div>
              ) : activeScreen ? (
                <button type="button" className="sim-screen-btn" onClick={placeHotspot} aria-label="Preview screen — click to place hotspot when placing">
                  {/* eslint-disable-next-line @next/next/no-img-element -- dynamic R2 upload */}
                  <img className="sim-screen" src={activeScreen.url || `/api/media?key=${encodeURIComponent(activeScreen.key)}`} alt={activeScreen.alt} />
                  {step?.hotspot && <span className="sim-hotspot" aria-hidden="true" style={{ "--hx": `${step.hotspot.x}%`, "--hy": `${step.hotspot.y}%`, "--hw": `${step.hotspot.w}%`, "--hh": `${step.hotspot.h}%` } as React.CSSProperties} />}
                </button>
              ) : (
                <div className="sim-stage-empty"><p>{draft.mode === "iframe" ? "Enter a sandbox URL and test embeddability to preview." : "Upload a screen to preview."}</p></div>
              )}
            </div>
          </div>

          {status && <p className="approved-note">{status}</p>}
          {error && <p className="signin-error" role="alert">{error}</p>}
          {publishBlock && !error && <p className="model-note" role="status">{publishBlock}</p>}
          <div className="sim-editor-actions">
            <button type="button" className="button button-secondary" onClick={() => save(false)} disabled={saving}>{saving ? "Saving…" : "Save draft"}</button>
            <button type="button" className="button button-primary" onClick={() => save(true)} disabled={saving || Boolean(publishBlock)}>{draft.status === "Published" ? "Save & keep published" : "Publish to learners"} →</button>
            {selectedId && <button type="button" className="text-button sim-delete" onClick={remove} disabled={saving}>Delete</button>}
          </div>
        </section>
      </div>
    </div>
  );
}
