// Immersive content helpers: turn an approved procedure into a visual
// flow diagram, a branching interactive scenario with per-step coaching,
// and accessible captions / transcript alternatives.
//
// Everything is deterministic and dependency-free so it renders
// identically on the server (RSC) and client, and so the visuals stay
// grounded to the same approved source the text came from.

const THEME = {
  stroke: "#72ddef",
  strokeSoft: "rgba(114,221,239,.35)",
  violet: "#a889fa",
  green: "#7be4bd",
  ink: "#e8eef8",
  dim: "#8fa9cf",
  panel: "#0d1523",
};

export function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function truncate(value, max = 40) {
  const text = String(value);
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function toSteps(input) {
  if (Array.isArray(input)) {
    return input.map((step) => (typeof step === "string" ? step : step.label ?? "")).filter(Boolean);
  }
  if (input && Array.isArray(input.procedure)) return input.procedure;
  if (input && Array.isArray(input.steps)) return input.steps.map((step) => step.label ?? String(step));
  return [];
}

// Deterministic vertical flow diagram (SVG string) for a procedure.
// The caller wraps it with an accessible label; a text transcript is
// always offered alongside via `buildTranscript`.
export function generateProcedureDiagramSvg(input, options = {}) {
  const steps = toSteps(input);
  const title = options.title ?? "Approved procedure";
  if (steps.length === 0) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 80" role="img" aria-label="No procedure steps"><text x="24" y="44" fill="${THEME.dim}" font-size="14">No approved steps to visualise.</text></svg>`;
  }

  const nodeHeight = 56;
  const gap = 26;
  const width = 520;
  const top = 20;
  const height = top * 2 + steps.length * nodeHeight + (steps.length - 1) * gap;
  const accent = options.accent === "violet" ? THEME.violet : options.accent === "green" ? THEME.green : THEME.stroke;

  const parts = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(title)}: ${steps.length} step flow diagram" preserveAspectRatio="xMidYMin meet">`,
  );
  parts.push(`<title>${escapeXml(title)}</title>`);
  parts.push(
    `<defs><linearGradient id="amyEdge" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${accent}" stop-opacity=".8"/><stop offset="1" stop-color="${accent}" stop-opacity=".15"/></linearGradient></defs>`,
  );

  steps.forEach((step, index) => {
    const y = top + index * (nodeHeight + gap);
    const cx = 52;
    if (index > 0) {
      const prevBottom = y - gap;
      parts.push(`<line x1="${cx}" y1="${prevBottom}" x2="${cx}" y2="${y}" stroke="url(#amyEdge)" stroke-width="2"/>`);
      parts.push(`<polygon points="${cx - 4},${y - 6} ${cx + 4},${y - 6} ${cx},${y}" fill="${accent}"/>`);
    }
    parts.push(`<circle cx="${cx}" cy="${y + nodeHeight / 2}" r="16" fill="${THEME.panel}" stroke="${accent}" stroke-width="1.5"/>`);
    parts.push(
      `<text x="${cx}" y="${y + nodeHeight / 2 + 5}" text-anchor="middle" fill="${accent}" font-size="14" font-weight="700">${index + 1}</text>`,
    );
    parts.push(
      `<rect x="84" y="${y}" width="${width - 108}" height="${nodeHeight}" rx="12" fill="${THEME.panel}" stroke="${THEME.strokeSoft}"/>`,
    );
    parts.push(
      `<text x="104" y="${y + nodeHeight / 2 + 5}" fill="${THEME.ink}" font-size="14">${escapeXml(truncate(step, 52))}</text>`,
    );
  });

  parts.push("</svg>");
  return parts.join("");
}

// A branching interactive scenario: each step offers the approved action
// plus plausible distractors and coaching for wrong choices.
export function buildInteractiveScenario(mission, options = {}) {
  const steps = Array.isArray(mission?.steps) ? mission.steps : [];
  const distractors = options.distractors ?? ["Open Reports", "Archive workspace", "Change billing", "Delete project"];
  return {
    id: mission?.id ?? "scenario",
    title: mission?.title ?? "Interactive scenario",
    objective: mission?.objective ?? "",
    sourceId: mission?.sourceId,
    steps: steps.map((step, index) => {
      const wrong = distractors.filter((option) => option !== step.label).slice(0, 2);
      return {
        index,
        type: index === steps.length - 1 ? "confirm" : "select",
        prompt: step.label,
        hint: step.hint ?? "",
        coaching:
          step.coaching ??
          `That is not the approved next action. Follow step ${index + 1}: ${step.label}.`,
        options: [{ label: step.label, correct: true }, ...wrong.map((label) => ({ label, correct: false }))],
      };
    }),
  };
}

// Score a scenario attempt deterministically (errors reduce competency).
export function scoreScenarioAttempt({ steps, errors }) {
  const total = Math.max(1, steps);
  const penalty = Math.min(errors, total) * 8;
  return Math.max(60, 100 - penalty);
}

// Accessible caption/transcript alternative for a visual procedure.
export function buildTranscript(input, options = {}) {
  const steps = toSteps(input);
  const title = options.title ?? "Approved procedure";
  const captions = steps.map((step, index) => ({
    index: index + 1,
    text: `Step ${index + 1}: ${step}`,
  }));
  return {
    title,
    captions,
    transcript: [`${title}. ${steps.length} approved steps.`, ...captions.map((caption) => caption.text)].join("\n"),
  };
}
