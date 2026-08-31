"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { isOriginAllowed, normaliseOrigin, scoreSimulationRun, simulationSandboxTokens } from "../lib/simbuilder.mjs";
import type { SimulationDefinition, SimOrigin } from "./types";

// Learner runtime for a vendor SaaS simulation. Renders the authored guided
// overlay (ordered steps + hotspots + coaching) on top of either a sandboxed
// iframe embed or a screenshot walkthrough, with explicit "SIMULATION — not
// production" chrome. Never runs against a production system.

type RunResult = { score: number; errors: number; steps: number };

function mediaUrl(screen: { url: string; key: string }): string {
  if (screen.url) return screen.url;
  return screen.key ? `/api/media?key=${encodeURIComponent(screen.key)}` : "";
}

export function SimulationRunner({ simulation, allowedOrigins, onComplete, onExit }: {
  simulation: SimulationDefinition;
  allowedOrigins: SimOrigin[];
  onComplete?: (result: RunResult) => void;
  onExit?: () => void;
}) {
  const steps = useMemo(() => simulation.steps ?? [], [simulation.steps]);
  const [current, setCurrent] = useState(0);
  const [errors, setErrors] = useState(0);
  const [complete, setComplete] = useState(false);
  const [miss, setMiss] = useState(false);
  const completedRef = useRef(false);

  const targetOrigin = normaliseOrigin(simulation.targetUrl);
  const allowList = useMemo(() => allowedOrigins.map((entry) => entry.origin), [allowedOrigins]);
  const originAllowed = simulation.mode === "iframe" && isOriginAllowed(simulation.targetUrl, allowList);
  // Use the sandboxed iframe only when the target is embeddable AND on the
  // workspace allow-list; otherwise fall back to the screenshot walkthrough.
  const useIframe = simulation.mode === "iframe" && simulation.embeddable && originAllowed;
  const sandbox = simulationSandboxTokens().join(" ");

  const finish = useCallback((errorCount: number) => {
    if (completedRef.current) return;
    completedRef.current = true;
    setComplete(true);
    onComplete?.({ score: scoreSimulationRun({ steps: steps.length, errors: errorCount }), errors: errorCount, steps: steps.length });
  }, [onComplete, steps.length]);

  const advance = useCallback(() => {
    setMiss(false);
    setCurrent((value) => {
      if (value >= steps.length - 1) {
        finish(errors);
        return value;
      }
      return value + 1;
    });
  }, [errors, finish, steps.length]);

  // Optional postMessage bridge: when the vendor cooperates, the embedded app
  // posts step events we match to advance automatically. We only trust
  // messages from the simulation's own target origin.
  useEffect(() => {
    if (!useIframe || !simulation.bridgeEnabled) return;
    function onMessage(event: MessageEvent) {
      if (!targetOrigin || event.origin !== targetOrigin) return;
      const data = event.data as { type?: string; event?: string } | undefined;
      const name = (data?.type ?? data?.event ?? "").toString();
      const expected = steps[current]?.match?.event;
      if (expected && name === expected) advance();
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [advance, current, simulation.bridgeEnabled, steps, targetOrigin, useIframe]);

  if (steps.length === 0) {
    return (
      <section className="panel sim-runner">
        <div className="sim-chrome"><span className="sim-flag">SIMULATION — not production</span><strong>{simulation.title}</strong></div>
        <p className="model-note">This simulation has no steps yet.</p>
        {onExit && <button type="button" className="button button-secondary" onClick={onExit}>Back</button>}
      </section>
    );
  }

  const step = steps[Math.min(current, steps.length - 1)];
  const screen = simulation.screens?.[step?.screenIndex ?? 0] ?? simulation.screens?.[0];
  const hotspot = step?.hotspot;

  function handleScreenClick(event: React.MouseEvent<HTMLButtonElement>) {
    if (!hotspot) { advance(); return; }
    const rect = event.currentTarget.getBoundingClientRect();
    const px = ((event.clientX - rect.left) / rect.width) * 100;
    const py = ((event.clientY - rect.top) / rect.height) * 100;
    const inside = px >= hotspot.x && px <= hotspot.x + hotspot.w && py >= hotspot.y && py <= hotspot.y + hotspot.h;
    if (inside) advance();
    else { setErrors((value) => value + 1); setMiss(true); }
  }

  return (
    <section className="panel sim-runner" aria-label={`Simulation: ${simulation.title}`}>
      <div className="sim-chrome">
        <span className="sim-flag" role="status">SIMULATION — not production</span>
        <strong>{simulation.title}</strong>
        <span className="sim-mode-chip">{useIframe ? "Live sandbox" : "Guided walkthrough"}</span>
        {onExit && <button type="button" className="text-button sim-exit" onClick={onExit}>Exit</button>}
      </div>

      <div className="sim-runner-body">
        <aside className="sim-steps" aria-label="Guided steps">
          <ol>
            {steps.map((entry, index) => (
              <li key={entry.id} className={complete || index < current ? "done" : index === current ? "active" : ""}>
                <span>{complete || index < current ? "✓" : index + 1}</span>
                <span>{entry.label}</span>
              </li>
            ))}
          </ol>
          {!complete && step?.coaching && <div className="sim-coach"><span>✦</span><p>{step.coaching}</p></div>}
          {miss && <div className="sim-coaching" role="alert"><span>!</span><p>Not quite — follow the highlighted area for this step.</p></div>}
        </aside>

        <div className="sim-stage">
          {complete ? (
            <div className="simulation-success sim-stage-done">
              <span>✓</span>
              <h2>Simulation complete</h2>
              <p>You worked through {steps.length} {steps.length === 1 ? "step" : "steps"} with {errors} {errors === 1 ? "misstep" : "missteps"}.</p>
              <strong>{scoreSimulationRun({ steps: steps.length, errors })}% practical competency</strong>
            </div>
          ) : useIframe ? (
            <div className="sim-frame-wrap">
              <iframe
                title={`${simulation.title} — sandboxed simulation`}
                src={simulation.targetUrl}
                sandbox={sandbox}
                referrerPolicy="no-referrer"
                loading="lazy"
                className="sim-frame"
              />
              {hotspot && (
                <div className="sim-hotspot" aria-hidden="true" style={{ "--hx": `${hotspot.x}%`, "--hy": `${hotspot.y}%`, "--hw": `${hotspot.w}%`, "--hh": `${hotspot.h}%` } as React.CSSProperties} />
              )}
              <div className="sim-frame-note">Interact in the sandbox, then advance. {simulation.bridgeEnabled ? "Steps auto-advance when the product reports progress." : ""}</div>
            </div>
          ) : screen ? (
            <button type="button" className="sim-screen-btn" onClick={handleScreenClick} aria-label={`${step.label} — click the highlighted area`}>
              {/* eslint-disable-next-line @next/next/no-img-element -- dynamic R2-served screenshot, not a static asset */}
              <img className="sim-screen" src={mediaUrl(screen)} alt={screen.alt || step.label} />
              {hotspot && (
                <span className="sim-hotspot" aria-hidden="true" style={{ "--hx": `${hotspot.x}%`, "--hy": `${hotspot.y}%`, "--hw": `${hotspot.w}%`, "--hh": `${hotspot.h}%` } as React.CSSProperties} />
              )}
            </button>
          ) : (
            <div className="sim-stage-empty"><p>{simulation.mode === "iframe" ? "This target is not embeddable in your workspace. Ask an author to add screenshots for a guided walkthrough." : "No screens uploaded yet."}</p></div>
          )}
        </div>
      </div>

      {!complete && (
        <div className="sim-runner-actions">
          <span className="sim-progress-label">Step {Math.min(current + 1, steps.length)} of {steps.length}</span>
          {(useIframe || !hotspot) && <button type="button" className="button button-primary" onClick={advance}>{current >= steps.length - 1 ? "Finish simulation" : "I did this — next step"} <span>→</span></button>}
        </div>
      )}
    </section>
  );
}
