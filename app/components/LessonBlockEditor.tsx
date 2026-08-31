"use client";

import { useEffect, useRef, useState } from "react";
import { generateProcedureDiagramSvg } from "../lib/simulation.mjs";
import type { Citation, LessonBlock, BlockType, SimulationDefinition } from "./types";

const BLOCK_LABELS: Record<BlockType, string> = {
  text: "Text",
  callout: "Callout",
  image: "Image",
  video: "Video",
  embed: "Embed",
  quiz: "Quiz",
  "procedure-diagram": "Diagram",
  "simulation-step": "Simulation step",
  simulation: "Simulation",
};

// Cache the workspace's simulations so every simulation block doesn't refetch.
let simulationsCache: Promise<SimulationDefinition[]> | null = null;
function loadSimulations(): Promise<SimulationDefinition[]> {
  if (!simulationsCache) {
    simulationsCache = fetch("/api/simulations")
      .then((response) => (response.ok ? response.json() : { simulations: [] }))
      .then((data: { simulations?: SimulationDefinition[] }) => data.simulations ?? [])
      .catch(() => []);
  }
  return simulationsCache;
}

const uid = () => (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `blk-${Math.random().toString(36).slice(2)}`);

export function newBlock(type: BlockType, citation?: Citation, seed?: Partial<LessonBlock>): LessonBlock {
  const base = { id: uid(), citation } as { id: string; citation?: Citation };
  switch (type) {
    case "callout": return { ...base, type, tone: "info", text: "", ...(seed as object) } as LessonBlock;
    case "image": return { ...base, type, url: "", key: "", alt: "", caption: "", ...(seed as object) } as LessonBlock;
    case "video": return { ...base, type, url: "", caption: "", ...(seed as object) } as LessonBlock;
    case "embed": return { ...base, type, url: "", caption: "", ...(seed as object) } as LessonBlock;
    case "quiz": return { ...base, type, question: "", options: ["", ""], correct: 0, ...(seed as object) } as LessonBlock;
    case "procedure-diagram": return { ...base, type, title: "Procedure", steps: [], ...(seed as object) } as LessonBlock;
    case "simulation-step": return { ...base, type, label: "", hint: "", coaching: "", ...(seed as object) } as LessonBlock;
    case "simulation": return { ...base, type, simulationId: "", title: "", ...(seed as object) } as LessonBlock;
    default: return { ...base, type: "text", text: "", ...(seed as object) } as LessonBlock;
  }
}

function CitationTag({ citation }: { citation?: Citation }) {
  if (!citation) return null;
  return <span className="citation-inline">▣ {citation.title} · v{citation.version}{citation.section ? ` · ${citation.section}` : ""}</span>;
}

function SimulationBlockBody({ block, update }: { block: Extract<LessonBlock, { type: "simulation" }>; update: (patch: Partial<LessonBlock>) => void }) {
  const [simulations, setSimulations] = useState<SimulationDefinition[]>([]);
  useEffect(() => { let active = true; loadSimulations().then((list) => { if (active) setSimulations(list); }); return () => { active = false; }; }, []);
  const selected = simulations.find((simulation) => simulation.id === block.simulationId);
  return (
    <div className="block-simulation-edit">
      <select
        aria-label="Vendor simulation"
        value={block.simulationId}
        onChange={(event) => {
          const simulation = simulations.find((entry) => entry.id === event.target.value);
          update({ simulationId: event.target.value, title: simulation?.title ?? "" } as Partial<LessonBlock>);
        }}
      >
        <option value="">Select a vendor simulation…</option>
        {simulations.map((simulation) => <option key={simulation.id} value={simulation.id}>{simulation.title} · {simulation.mode === "iframe" ? "embed" : "walkthrough"} ({simulation.status})</option>)}
      </select>
      {selected ? (
        <p className="block-sim-ref">▶ Learners will run <strong>{selected.title}</strong> ({selected.steps.length} steps). {selected.status !== "Published" ? "Publish it in the Simulations builder to make it available." : "Published."}</p>
      ) : (
        <p className="model-note">Build simulations in the Simulations workspace, then reference one here.</p>
      )}
    </div>
  );
}

function BlockBody({ block, update }: { block: LessonBlock; update: (patch: Partial<LessonBlock>) => void }) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function uploadImage(file?: File) {
    if (!file) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const response = await fetch("/api/media", { method: "POST", body: form });
      if (response.ok) { const data = (await response.json()) as { key: string; url: string }; update({ url: data.url, key: data.key } as Partial<LessonBlock>); }
    } finally { setUploading(false); }
  }

  switch (block.type) {
    case "text":
      return <textarea aria-label="Text block" rows={4} value={block.text} onChange={(event) => update({ text: event.target.value } as Partial<LessonBlock>)} placeholder="Lesson text (grounded to the source)…" />;
    case "callout":
      return (
        <div className="block-callout-edit">
          <select aria-label="Callout tone" value={block.tone} onChange={(event) => update({ tone: event.target.value as "info" | "warning" | "success" } as Partial<LessonBlock>)}><option value="info">Info</option><option value="warning">Warning</option><option value="success">Success</option></select>
          <textarea aria-label="Callout text" rows={2} value={block.text} onChange={(event) => update({ text: event.target.value } as Partial<LessonBlock>)} placeholder="Callout message…" />
        </div>
      );
    case "image":
      return (
        <div className="block-media-edit">
          {/* eslint-disable-next-line @next/next/no-img-element -- dynamic R2-served blob, not a static asset */}
          {block.url && <img className="block-image-preview" src={block.url} alt={block.alt || "Lesson image preview"} />}
          <div className="block-media-actions">
            <input ref={fileInput} type="file" accept="image/*" className="visually-hidden-file" onChange={(event) => uploadImage(event.target.files?.[0])} aria-label="Upload image" />
            <button type="button" className="button button-secondary button-small" onClick={() => fileInput.current?.click()} disabled={uploading}>{uploading ? "Uploading…" : block.url ? "Replace image" : "Upload image"}</button>
          </div>
          <input aria-label="Image alt text" value={block.alt} onChange={(event) => update({ alt: event.target.value } as Partial<LessonBlock>)} placeholder="Alt text (required for accessibility)" />
          <input aria-label="Image caption" value={block.caption} onChange={(event) => update({ caption: event.target.value } as Partial<LessonBlock>)} placeholder="Caption" />
        </div>
      );
    case "video":
    case "embed":
      return (
        <div className="block-media-edit">
          <input aria-label={`${block.type} URL`} value={block.url} onChange={(event) => update({ url: event.target.value } as Partial<LessonBlock>)} placeholder={block.type === "video" ? "Video URL (mp4 / embed)" : "Embed URL"} />
          <input aria-label="Caption" value={block.caption} onChange={(event) => update({ caption: event.target.value } as Partial<LessonBlock>)} placeholder="Caption" />
        </div>
      );
    case "quiz":
      return (
        <div className="block-quiz-edit">
          <textarea aria-label="Quiz question" rows={2} value={block.question} onChange={(event) => update({ question: event.target.value } as Partial<LessonBlock>)} placeholder="Question…" />
          {block.options.map((option, index) => (
            <div className="quiz-option-row" key={index}>
              <input type="radio" name={`correct-${block.id}`} checked={block.correct === index} onChange={() => update({ correct: index } as Partial<LessonBlock>)} aria-label={`Mark option ${index + 1} correct`} />
              <input aria-label={`Option ${index + 1}`} value={option} onChange={(event) => { const options = [...block.options]; options[index] = event.target.value; update({ options } as Partial<LessonBlock>); }} placeholder={`Option ${index + 1}`} />
              <button type="button" className="text-button" onClick={() => { const options = block.options.filter((_, i) => i !== index); update({ options, correct: Math.min(block.correct, options.length - 1) } as Partial<LessonBlock>); }} aria-label="Remove option">✕</button>
            </div>
          ))}
          <button type="button" className="button button-secondary button-small" onClick={() => update({ options: [...block.options, ""] } as Partial<LessonBlock>)}>Add option</button>
        </div>
      );
    case "procedure-diagram":
      return (
        <div className="block-diagram-edit">
          <input aria-label="Diagram title" value={block.title} onChange={(event) => update({ title: event.target.value } as Partial<LessonBlock>)} placeholder="Diagram title" />
          <textarea aria-label="Diagram steps (one per line)" rows={4} value={block.steps.join("\n")} onChange={(event) => update({ steps: event.target.value.split("\n").map((s) => s.trim()).filter(Boolean) } as Partial<LessonBlock>)} placeholder="One step per line" />
          {block.steps.length > 0 && <div className="procedure-diagram" aria-hidden="true" dangerouslySetInnerHTML={{ __html: generateProcedureDiagramSvg(block.steps, { title: block.title, accent: "violet" }) }} />}
        </div>
      );
    case "simulation-step":
      return (
        <div className="block-sim-edit">
          <input aria-label="Step label" value={block.label} onChange={(event) => update({ label: event.target.value } as Partial<LessonBlock>)} placeholder="Approved action" />
          <input aria-label="Step hint" value={block.hint} onChange={(event) => update({ hint: event.target.value } as Partial<LessonBlock>)} placeholder="Progressive hint" />
          <input aria-label="Step coaching" value={block.coaching} onChange={(event) => update({ coaching: event.target.value } as Partial<LessonBlock>)} placeholder="Coaching for a wrong choice" />
        </div>
      );
    case "simulation":
      return <SimulationBlockBody block={block} update={update} />;
    default:
      return null;
  }
}

export function LessonBlockEditor({ blocks, onChange, citation }: { blocks: LessonBlock[]; onChange: (blocks: LessonBlock[]) => void; citation?: Citation }) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  function update(id: string, patch: Partial<LessonBlock>) {
    onChange(blocks.map((block) => (block.id === id ? ({ ...block, ...patch } as LessonBlock) : block)));
  }
  function remove(id: string) { onChange(blocks.filter((block) => block.id !== id)); }
  function move(id: string, direction: -1 | 1) {
    const index = blocks.findIndex((block) => block.id === id);
    const next = index + direction;
    if (index < 0 || next < 0 || next >= blocks.length) return;
    const reordered = [...blocks];
    [reordered[index], reordered[next]] = [reordered[next], reordered[index]];
    onChange(reordered);
  }
  function drop(targetId: string) {
    if (!dragId || dragId === targetId) return;
    const from = blocks.findIndex((block) => block.id === dragId);
    const to = blocks.findIndex((block) => block.id === targetId);
    if (from < 0 || to < 0) return;
    const reordered = [...blocks];
    const [moved] = reordered.splice(from, 1);
    reordered.splice(to, 0, moved);
    onChange(reordered);
    setDragId(null);
  }
  function add(type: BlockType) { onChange([...blocks, newBlock(type, citation)]); setMenuOpen(false); }

  return (
    <div className="block-editor">
      {blocks.map((block) => (
        <div
          key={block.id}
          className={`block-row ${dragId === block.id ? "dragging" : ""}`}
          draggable
          onDragStart={() => setDragId(block.id)}
          onDragOver={(event) => event.preventDefault()}
          onDrop={() => drop(block.id)}
        >
          <div className="block-handle" aria-hidden="true" title="Drag to reorder">⋮⋮</div>
          <div className="block-main">
            <div className="block-head"><span className="block-type-tag">{BLOCK_LABELS[block.type]}</span><CitationTag citation={block.citation} />
              <span className="block-controls">
                <button type="button" className="icon-button" onClick={() => move(block.id, -1)} aria-label="Move block up">↑</button>
                <button type="button" className="icon-button" onClick={() => move(block.id, 1)} aria-label="Move block down">↓</button>
                <button type="button" className="icon-button" onClick={() => remove(block.id)} aria-label="Delete block">✕</button>
              </span>
            </div>
            <BlockBody block={block} update={(patch) => update(block.id, patch)} />
          </div>
        </div>
      ))}
      <div className="block-add">
        <button type="button" className="button button-secondary button-small" onClick={() => setMenuOpen((open) => !open)}>＋ Add block</button>
        {menuOpen && (
          <div className="block-add-menu" role="menu">
            {(Object.keys(BLOCK_LABELS) as BlockType[]).map((type) => <button type="button" key={type} role="menuitem" onClick={() => add(type)}>{BLOCK_LABELS[type]}</button>)}
          </div>
        )}
      </div>
    </div>
  );
}
