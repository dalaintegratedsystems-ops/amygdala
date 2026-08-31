"use client";

import { useState } from "react";
import type { Blueprint, BlueprintModule, CoverageReport, EditorHint, GeneratedCourse, StoredSource } from "./types";

// ---- Coverage & grounding review panel -------------------------------

function confidenceTone(value: number): string {
  if (value >= 0.75) return "success";
  if (value >= 0.5) return "info";
  return "warning";
}

export function ConfidenceChip({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  return <span className={`confidence-chip confidence-${confidenceTone(value)}`} title="Grounding confidence">◆ {pct}% confidence</span>;
}

export function CoveragePanel({ report, onRecheck, busy }: { report?: CoverageReport; onRecheck?: () => void; busy?: boolean }) {
  if (!report) {
    return (
      <div className="coverage-panel">
        <p className="model-note">Run a coverage check to see how much of the source this course teaches and whether any claims look unsupported.</p>
        {onRecheck && <button type="button" className="button button-secondary button-small" onClick={onRecheck} disabled={busy}>{busy ? "Checking…" : "Check coverage"}</button>}
      </div>
    );
  }
  return (
    <div className="coverage-panel">
      <div className="coverage-metrics">
        <span><small>Source coverage</small><strong>{report.coveragePercent}%</strong><em>{report.sectionsCovered}/{report.sectionsTotal} sections</em></span>
        <span><small>Grounded claims</small><strong>{Math.round(report.claims.groundedRatio * 100)}%</strong><em>{report.claims.grounded}/{report.claims.total}</em></span>
        <span><small>Avg confidence</small><strong>{Math.round(report.confidence.average * 100)}%</strong></span>
      </div>
      {report.claims.ungrounded.length > 0 ? (
        <div className="coverage-flags">
          <span className="tiny-label">Possible unsupported claims — review before publish</span>
          <ul className="check-list">
            {report.claims.ungrounded.map((claim, index) => (
              <li key={index} className="coverage-flag"><em>{claim.where}</em>{claim.text}</li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="approved-note">✓ No unsupported claims detected against the source.</p>
      )}
      {onRecheck && <button type="button" className="button button-secondary button-small" onClick={onRecheck} disabled={busy}>{busy ? "Checking…" : "Re-check coverage"}</button>}
    </div>
  );
}

// ---- Blueprint proposer ----------------------------------------------

export function BlueprintProposer({ sourceId, source, onAccept }: { sourceId: string; source?: StoredSource; onAccept: (blueprint: Blueprint) => void }) {
  const [blueprint, setBlueprint] = useState<Blueprint | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function propose() {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/authoring/blueprint", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(source ? { source } : { sourceId }) });
      if (!response.ok) { const data = await response.json().catch(() => ({})); throw new Error(data.error ?? "Could not propose a blueprint."); }
      const data = (await response.json()) as { blueprint: Blueprint };
      setBlueprint(data.blueprint);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not propose a blueprint.");
    } finally { setLoading(false); }
  }

  function updateModule(id: string, patch: Partial<BlueprintModule>) {
    setBlueprint((current) => current ? { ...current, modules: current.modules.map((module) => (module.id === id ? { ...module, ...patch } : module)) } : current);
  }
  function removeModule(id: string) {
    setBlueprint((current) => current ? { ...current, modules: current.modules.filter((module) => module.id !== id) } : current);
  }
  function moveModule(id: string, direction: -1 | 1) {
    setBlueprint((current) => {
      if (!current) return current;
      const index = current.modules.findIndex((module) => module.id === id);
      const next = index + direction;
      if (index < 0 || next < 0 || next >= current.modules.length) return current;
      const modules = [...current.modules];
      [modules[index], modules[next]] = [modules[next], modules[index]];
      return { ...current, modules };
    });
  }

  return (
    <section className="panel architect-panel">
      <div className="panel-header"><div><span className="tiny-label">AI course architect</span><h2>Proposed course blueprint</h2></div>{blueprint && <span className="engine-badge">{blueprint.engine === "openai-llm" ? "gpt-5.6-sol" : "deterministic"}</span>}</div>
      {!blueprint ? (
        <div className="architect-empty">
          <p>Let the AI architect propose a structure — modules, objectives, durations, difficulty and prerequisite order — grounded in your source. Review and edit it before generating.</p>
          <button type="button" className="button button-primary" onClick={propose} disabled={loading}>{loading ? "Thinking…" : "Propose a blueprint"} <span>✦</span></button>
          {error && <p className="signin-error" role="alert">{error}</p>}
        </div>
      ) : (
        <div className="blueprint">
          <div className="blueprint-meta"><span><small>Difficulty</small><strong>{blueprint.difficulty}</strong></span><span><small>Estimated</small><strong>{blueprint.estimatedMinutes} min</strong></span><span><small>Modules</small><strong>{blueprint.modules.length}</strong></span></div>
          <p className="architect-rationale">{blueprint.rationale}</p>
          <ol className="blueprint-modules">
            {blueprint.modules.map((module, index) => (
              <li key={module.id} className="blueprint-module">
                <div className="blueprint-module-order">{index + 1}</div>
                <div className="blueprint-module-body">
                  <input aria-label="Module title" className="blueprint-title-input" value={module.title} onChange={(event) => updateModule(module.id, { title: event.target.value })} />
                  <textarea aria-label="Learning objective" rows={2} value={module.objective} onChange={(event) => updateModule(module.id, { objective: event.target.value })} />
                  <div className="blueprint-module-controls">
                    <label className="mini-field"><span>Duration</span><input type="number" min={2} max={45} value={module.durationMinutes} onChange={(event) => updateModule(module.id, { durationMinutes: Number(event.target.value) })} /></label>
                    <label className="mini-field"><span>Difficulty</span><select value={module.difficulty} onChange={(event) => updateModule(module.id, { difficulty: event.target.value })}><option>Introductory</option><option>Intermediate</option><option>Advanced</option></select></label>
                    <span className="blueprint-actions">
                      <button type="button" className="icon-button" onClick={() => moveModule(module.id, -1)} aria-label="Move up">↑</button>
                      <button type="button" className="icon-button" onClick={() => moveModule(module.id, 1)} aria-label="Move down">↓</button>
                      <button type="button" className="icon-button" onClick={() => removeModule(module.id)} aria-label="Remove module">✕</button>
                    </span>
                  </div>
                  {module.rationale && <p className="blueprint-module-rationale">{module.rationale}</p>}
                </div>
              </li>
            ))}
          </ol>
          <div className="blueprint-cta">
            <button type="button" className="button button-secondary" onClick={propose} disabled={loading}>Re-propose</button>
            <button type="button" className="button button-primary" onClick={() => onAccept(blueprint)}>Accept blueprint &amp; generate course →</button>
          </div>
        </div>
      )}
    </section>
  );
}

// ---- Inline hints panel ----------------------------------------------

export function HintsPanel({ hints, onApply, busyId }: { hints: EditorHint[]; onApply: (hint: EditorHint) => void; busyId?: string }) {
  if (!hints.length) return <div className="hints-empty"><span>✓</span> No issues detected. This draft looks well-structured.</div>;
  return (
    <div className="hints-list">
      {hints.map((hint) => (
        <div className={`hint-card hint-${hint.severity}`} key={hint.id}>
          <span className="hint-icon" aria-hidden="true">{hint.severity === "warning" ? "!" : "✦"}</span>
          <div className="hint-body"><p>{hint.message}</p></div>
          <button type="button" className="button button-secondary button-small" onClick={() => onApply(hint)} disabled={busyId === hint.id}>{busyId === hint.id ? "Applying…" : "Apply"}</button>
        </div>
      ))}
    </div>
  );
}

// ---- Copilot bar (per-lesson grounded actions) -----------------------

const COPILOT_ACTIONS: Array<{ id: string; label: string }> = [
  { id: "make-concise", label: "Make concise" },
  { id: "rewrite-nontechnical", label: "Plain language" },
  { id: "generate-questions", label: "3 quiz questions" },
];

export function CopilotBar({ sourceId, source, text, onApplyText, onAddQuestions }: { sourceId: string; source?: StoredSource; text: string; onApplyText: (text: string) => void; onAddQuestions?: (questions: GeneratedCourse["assessment"]["questions"]) => void }) {
  const [busy, setBusy] = useState("");
  const [result, setResult] = useState<{ action: string; output?: string; questions?: GeneratedCourse["assessment"]["questions"]; spans?: string[]; engine?: string } | null>(null);
  const [error, setError] = useState("");

  async function run(action: string) {
    setBusy(action); setError(""); setResult(null);
    try {
      const response = await fetch("/api/authoring/copilot", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, text, ...(source ? { source } : { sourceId }) }) });
      if (!response.ok) { const data = await response.json().catch(() => ({})); throw new Error(data.error ?? "Copilot unavailable"); }
      setResult(await response.json());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Copilot unavailable");
    } finally { setBusy(""); }
  }

  return (
    <div className="copilot-bar">
      <div className="copilot-actions">
        <span className="tiny-label">Grounded copilot</span>
        {COPILOT_ACTIONS.map((action) => <button type="button" key={action.id} className="button button-secondary button-small" onClick={() => run(action.id)} disabled={Boolean(busy)}>{busy === action.id ? "…" : action.label}</button>)}
      </div>
      {error && <p className="signin-error" role="alert">{error}</p>}
      {result && (
        <div className="copilot-result">
          {result.output !== undefined && <><p className="copilot-output">{result.output}</p><button type="button" className="button button-primary button-small" onClick={() => { onApplyText(result.output ?? ""); setResult(null); }}>Apply suggestion</button></>}
          {result.questions && result.questions.length > 0 && (
            <div className="copilot-questions">
              {result.questions.map((question) => <div className="studio-question" key={question.id}><strong>{question.question}</strong><em>Answer: {question.options[question.correct ?? 0]}</em></div>)}
              {onAddQuestions && <button type="button" className="button button-primary button-small" onClick={() => { onAddQuestions(result.questions ?? []); setResult(null); }}>Add to assessment</button>}
            </div>
          )}
          {result.spans && result.spans.length > 0 && <div className="copilot-spans"><span className="tiny-label">Cited source spans</span>{result.spans.map((span, index) => <blockquote key={index}>{span}</blockquote>)}</div>}
          <span className="engine-badge small">{result.engine === "openai-llm" ? "gpt-5.6-sol" : "deterministic"} · review before publish</span>
        </div>
      )}
    </div>
  );
}
