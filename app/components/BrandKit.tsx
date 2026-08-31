"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { BrandKit } from "./types";

export const DEFAULT_BRAND: BrandKit = { workspaceName: "", logoKey: null, primaryColor: "", accentColor: "", fontFamily: "" };

const FONT_STACKS: Array<{ id: string; label: string; stack: string }> = [
  { id: "", label: "Amygdala default (Aptos)", stack: "" },
  { id: "modern-sans", label: "Modern sans (Inter / system)", stack: '"Inter", "Segoe UI", system-ui, sans-serif' },
  { id: "humanist", label: "Humanist (Optima / Avenir)", stack: '"Avenir Next", "Optima", "Segoe UI", sans-serif' },
  { id: "serif", label: "Editorial serif (Georgia)", stack: 'Georgia, "Times New Roman", serif' },
  { id: "geometric", label: "Geometric (Century Gothic)", stack: '"Century Gothic", "Futura", "Segoe UI", sans-serif' },
  { id: "mono", label: "Technical mono", stack: '"JetBrains Mono", "SFMono-Regular", ui-monospace, monospace' },
];

function fontStackFor(id: string): string {
  return FONT_STACKS.find((font) => font.id === id)?.stack ?? "";
}

// Lighten a hex colour toward white by `amount` (0..1) for the "bright" accent.
function lighten(hex: string, amount = 0.35): string {
  const value = hex.replace("#", "");
  const full = value.length === 3 ? value.split("").map((c) => c + c).join("") : value;
  if (full.length !== 6) return hex;
  const num = parseInt(full, 16);
  const r = Math.round(((num >> 16) & 255) + (255 - ((num >> 16) & 255)) * amount);
  const g = Math.round(((num >> 8) & 255) + (255 - ((num >> 8) & 255)) * amount);
  const b = Math.round((num & 255) + (255 - (num & 255)) * amount);
  return `#${[r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

// Apply a brand kit to the document root through the existing CSS custom
// properties. Passing an empty brand restores the defaults.
export function applyBrand(brand: BrandKit | null) {
  if (typeof document === "undefined") return;
  const root = document.documentElement.style;
  const set = (name: string, value: string) => (value ? root.setProperty(name, value) : root.removeProperty(name));
  const primary = brand?.primaryColor ?? "";
  const accent = brand?.accentColor ?? "";
  set("--cyan", primary);
  set("--cyan-bright", primary ? lighten(primary) : "");
  set("--line-strong", primary ? `${primary}55` : "");
  set("--violet", accent);
  set("--blue", accent);
  const stack = fontStackFor(brand?.fontFamily ?? "");
  set("--display", stack);
  set("--body", stack);
}

// Load + apply the workspace brand kit. Shared by admin and learner shells so
// branding is consistent everywhere.
export function useBrandKit(enabled: boolean) {
  const [brand, setBrand] = useState<BrandKit | null>(null);
  const reload = useCallback(() => {
    fetch("/api/brand")
      .then((response) => (response.ok ? response.json() : { brand: null }))
      .then((data: { brand: BrandKit | null }) => { setBrand(data.brand ?? null); applyBrand(data.brand ?? null); })
      .catch(() => { /* keep defaults */ });
  }, []);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    fetch("/api/brand")
      .then((response) => (response.ok ? response.json() : { brand: null }))
      .then((data: { brand: BrandKit | null }) => { if (active) { setBrand(data.brand ?? null); applyBrand(data.brand ?? null); } })
      .catch(() => { /* keep defaults */ });
    return () => { active = false; applyBrand(null); };
  }, [enabled]);
  return { brand, setBrand, reload };
}

function logoUrl(key: string | null): string | null {
  return key ? `/api/media?key=${encodeURIComponent(key)}` : null;
}

// Admin editor for the workspace brand kit, with live preview and logo upload.
export function BrandKitPanel({ onSaved }: { onSaved?: (brand: BrandKit) => void }) {
  const [draft, setDraft] = useState<BrandKit>(DEFAULT_BRAND);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [status, setStatus] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/brand").then((response) => (response.ok ? response.json() : { brand: null })).then((data: { brand: BrandKit | null }) => {
      if (!active) return;
      setDraft(data.brand ?? DEFAULT_BRAND);
      setLoaded(true);
    }).catch(() => setLoaded(true));
    return () => { active = false; };
  }, []);

  // Live preview: apply the draft to the running app as the author edits.
  useEffect(() => { if (loaded) applyBrand(draft); }, [draft, loaded]);

  function update(patch: Partial<BrandKit>) {
    setDraft((current) => ({ ...current, ...patch }));
    setStatus("");
  }

  async function uploadLogo(file?: File) {
    if (!file) return;
    setUploading(true); setStatus("");
    try {
      const form = new FormData();
      form.append("file", file);
      const response = await fetch("/api/media", { method: "POST", body: form });
      if (!response.ok) { const data = await response.json().catch(() => ({})); throw new Error(data.error ?? "Upload failed"); }
      const data = (await response.json()) as { key: string };
      update({ logoKey: data.key });
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Logo upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function save() {
    setSaving(true); setStatus("");
    try {
      const response = await fetch("/api/brand", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(draft),
      });
      if (!response.ok) { const data = await response.json().catch(() => ({})); throw new Error(data.error ?? "Save failed"); }
      const data = (await response.json()) as { brand: BrandKit };
      setDraft(data.brand);
      applyBrand(data.brand);
      setStatus("Saved. Branding applied across the workspace.");
      onSaved?.(data.brand);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  const preview = logoUrl(draft.logoKey);

  return (
    <section className="panel brand-kit">
      <div className="panel-header"><div><span className="tiny-label">Workspace brand</span><h2>Brand kit</h2></div></div>
      <p className="model-note">Your logo, colours and font apply live across the whole workspace — for you and your learners. Changes preview instantly and only persist when you save.</p>
      <div className="brand-kit-grid">
        <div className="brand-kit-fields">
          <label className="studio-field"><span className="tiny-label">Workspace name</span>
            <input aria-label="Workspace name" value={draft.workspaceName} onChange={(event) => update({ workspaceName: event.target.value })} placeholder="e.g. Northwind Academy" />
          </label>
          <div className="brand-color-row">
            <label className="studio-field"><span className="tiny-label">Primary colour</span>
              <span className="color-field"><input type="color" aria-label="Primary colour" value={draft.primaryColor || "#72ddef"} onChange={(event) => update({ primaryColor: event.target.value })} /><input aria-label="Primary colour hex" value={draft.primaryColor} onChange={(event) => update({ primaryColor: event.target.value })} placeholder="#72ddef" /></span>
            </label>
            <label className="studio-field"><span className="tiny-label">Accent colour</span>
              <span className="color-field"><input type="color" aria-label="Accent colour" value={draft.accentColor || "#a889fa"} onChange={(event) => update({ accentColor: event.target.value })} /><input aria-label="Accent colour hex" value={draft.accentColor} onChange={(event) => update({ accentColor: event.target.value })} placeholder="#a889fa" /></span>
            </label>
          </div>
          <label className="studio-field"><span className="tiny-label">Font</span>
            <select aria-label="Brand font" value={draft.fontFamily} onChange={(event) => update({ fontFamily: event.target.value })}>
              {FONT_STACKS.map((font) => <option key={font.id} value={font.id}>{font.label}</option>)}
            </select>
          </label>
          <div className="brand-logo-upload">
            <span className="tiny-label">Logo</span>
            <div className="brand-logo-actions">
              {/* eslint-disable-next-line @next/next/no-img-element -- dynamic R2-served blob, not a static asset */}
              {preview && <img className="brand-logo-preview" src={preview} alt="Workspace logo preview" width={44} height={44} />}
              <input ref={fileInput} id="brand-logo-file" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="visually-hidden-file" onChange={(event) => uploadLogo(event.target.files?.[0])} />
              <button type="button" className="button button-secondary button-small" onClick={() => fileInput.current?.click()} disabled={uploading}>{uploading ? "Uploading…" : preview ? "Replace logo" : "Upload logo"}</button>
              {draft.logoKey && <button type="button" className="text-button" onClick={() => update({ logoKey: null })}>Remove</button>}
            </div>
          </div>
          <div className="brand-kit-cta">
            <button type="button" className="button button-primary" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save brand kit"}</button>
            {status && <span className="approved-note">{status}</span>}
          </div>
        </div>
        <div className="brand-preview">
          <span className="tiny-label">Live preview</span>
          <div className="brand-preview-card">
            {/* eslint-disable-next-line @next/next/no-img-element -- dynamic R2-served blob, not a static asset */}
            <div className="brand-preview-head">{preview ? <img src={preview} alt="" width={32} height={32} /> : <span className="brand-preview-mark" style={{ background: draft.primaryColor || "var(--cyan)" }} />}<strong>{draft.workspaceName || "Your workspace"}</strong></div>
            <p>Grounded onboarding, branded to your organisation.</p>
            <div className="brand-preview-buttons">
              <button type="button" className="button button-primary button-small">Primary action</button>
              <button type="button" className="button button-secondary button-small">Secondary</button>
            </div>
            <div className="brand-preview-chips"><span className="status-pill verified"><i />Verified</span><span className="grounded-chip">✓ Grounded</span></div>
          </div>
        </div>
      </div>
    </section>
  );
}
