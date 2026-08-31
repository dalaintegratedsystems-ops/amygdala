// AI course-architect logic (deterministic core).
//
// Three grounded capabilities that the LLM layer in `ai.mjs` upgrades:
//  1. proposeBlueprint  — a suggested course structure (modules, objectives,
//     durations, difficulty, prerequisite ordering, rationale) the author
//     accepts or edits BEFORE generation.
//  2. deriveEditorHints — inline, non-blocking recommendations for a generated
//     course, each with a one-click "apply" descriptor.
//  3. copilot           — scoped, grounded authoring actions (make concise,
//     generate quiz questions, rewrite for a non-technical audience). Every
//     suggestion cites source spans; nothing publishes without human approval.
//
// All functions are pure/deterministic so they are testable offline and act as
// the credential-free fallback for the LLM variants.

import { outlineDocument } from "./ingest.mjs";
import { topicLabel } from "./authoring.mjs";

function describeSection(heading) {
  const match = String(heading ?? "").match(/^(\d{1,3}[A-Z]?)\.\s+(.+)$/);
  if (match) return { ref: `section ${match[1]}`, subject: match[2].replace(/\s+/g, " ").trim(), numbered: true };
  const subject = String(heading ?? "").replace(/\s+/g, " ").trim();
  return { ref: subject || "this part", subject: subject || "this topic", numbered: false };
}

function resolveOutline(source) {
  if (Array.isArray(source.outline) && source.outline.length) return source.outline;
  if (typeof source.extractedText === "string" && source.extractedText.length > 200) return outlineDocument(source.extractedText);
  return [];
}

function resolveKind(source) {
  if (source.documentType === "procedure" || source.documentType === "reference") return source.documentType;
  return Array.isArray(source.procedure) && source.procedure.length >= 3 ? "procedure" : "reference";
}

// First sentence of a passage, capped — a plain-language objective/summary.
function firstSentence(text, max = 160) {
  const clean = String(text ?? "").replace(/\s+/g, " ").trim();
  const match = clean.match(/^(.*?[.!?])(\s|$)/);
  return (match ? match[1] : clean).slice(0, max);
}

// Propose a course blueprint the author can accept or edit before generation.
export function proposeBlueprint(source, options = {}) {
  const label = topicLabel(source);
  const kind = resolveKind(source);

  if (kind === "procedure") {
    const steps = Array.isArray(source.procedure) ? source.procedure : [];
    const modules = [
      { id: "bp-learn", title: `Understand ${label}`, objective: `Explain what ${label} is and why it matters before performing it.`, durationMinutes: 6, difficulty: "Introductory", prerequisiteIds: [], rationale: "Concept first: learners perform a procedure more reliably once they understand its purpose." },
      { id: "bp-practise", title: `Practise ${label}`, objective: `Carry out the approved ${label} procedure step by step in a safe simulation.`, durationMinutes: Math.max(8, Math.min(20, steps.length * 2)), difficulty: "Intermediate", prerequisiteIds: ["bp-learn"], rationale: `The procedure has ${steps.length} approved steps, best rehearsed hands-on before assessment.` },
      { id: "bp-validate", title: `Prove ${label} readiness`, objective: `Demonstrate recall of the approved steps and pass the knowledge check.`, durationMinutes: 6, difficulty: "Intermediate", prerequisiteIds: ["bp-practise"], rationale: "Validation confirms the learner can act unaided before go-live." },
    ];
    return {
      ok: true,
      sourceId: source.id,
      title: `${label}: grounded onboarding`,
      documentType: kind,
      difficulty: "Intermediate",
      estimatedMinutes: modules.reduce((sum, module) => sum + module.durationMinutes, 0),
      rationale: `A short learn → practise → validate pathway fits a ${steps.length}-step procedure.`,
      modules,
      editable: true,
      generatedAt: options.generatedAt ?? null,
    };
  }

  const outline = resolveOutline(source).filter((entry) => describeSection(entry.section).subject.length >= 4);
  const chosen = outline.slice(0, 8);
  const modules = chosen.map((entry, index) => {
    const { subject } = describeSection(entry.section);
    const difficulty = index < 2 ? "Introductory" : index < 5 ? "Intermediate" : "Advanced";
    return {
      id: `bp-${index + 1}`,
      title: subject,
      objective: `Understand ${subject.toLowerCase().startsWith("the ") ? subject.toLowerCase() : "the provisions on " + subject.toLowerCase()}.`,
      durationMinutes: Math.max(4, Math.min(12, Math.round((entry.charCount || 400) / 350))),
      difficulty,
      prerequisiteIds: index === 0 ? [] : [`bp-${index}`],
      rationale: firstSentence(entry.summary) || `Covers ${subject} from the approved source.`,
      sectionRef: entry.section,
    };
  });
  modules.push({ id: "bp-validate", title: `Prove understanding of ${label}`, objective: `Pass a grounded assessment covering the key sections of ${label}.`, durationMinutes: 8, difficulty: "Intermediate", prerequisiteIds: modules.length ? [modules[modules.length - 1].id] : [], rationale: "A closing assessment validates comprehension across the document." });

  return {
    ok: modules.length > 1,
    sourceId: source.id,
    title: `${label}: grounded onboarding`,
    documentType: kind,
    difficulty: chosen.length > 5 ? "Advanced" : "Intermediate",
    estimatedMinutes: modules.reduce((sum, module) => sum + module.durationMinutes, 0),
    rationale: `A reference document with ${outline.length} substantive sections is best taught as sequenced knowledge modules with a final assessment.`,
    modules,
    editable: true,
    generatedAt: options.generatedAt ?? null,
  };
}

const DENSE_LESSON_CHARS = 900;

// Inline, non-blocking recommendations for a generated course. Each hint
// carries an `apply` descriptor the editor can act on with one click.
export function deriveEditorHints(course) {
  if (!course || course.ok === false) return [];
  const hints = [];
  const kind = course.kind ?? course.programme?.kind ?? "procedure";

  for (const lesson of course.lessons ?? []) {
    const length = String(lesson.content ?? "").length;
    if (length > DENSE_LESSON_CHARS) {
      hints.push({
        id: `hint-dense-${lesson.id}`,
        type: "dense-section",
        severity: "suggestion",
        target: { kind: "lesson", id: lesson.id },
        message: `"${lesson.title}" is dense (${length} characters). Split it into two shorter lessons so learners can absorb it.`,
        apply: { action: "split-lesson", lessonId: lesson.id },
      });
    }
    if (!lesson.content || String(lesson.content).trim().length < 20) {
      hints.push({
        id: `hint-empty-${lesson.id}`,
        type: "empty-lesson",
        severity: "warning",
        target: { kind: "lesson", id: lesson.id },
        message: `"${lesson.title}" has almost no content. Use the copilot to draft a grounded summary.`,
        apply: { action: "copilot", copilotAction: "expand", lessonId: lesson.id },
      });
    }
  }

  // A knowledge check per module keeps learners honest.
  const questionCount = course.assessment?.questions?.length ?? 0;
  const moduleCount = (course.modules ?? []).length;
  if (questionCount < Math.max(3, Math.min(moduleCount, 6))) {
    hints.push({
      id: "hint-knowledge-check",
      type: "add-knowledge-check",
      severity: "suggestion",
      target: { kind: "assessment", id: course.assessment?.id ?? "assessment" },
      message: `Only ${questionCount} assessment question(s) for ${moduleCount} module(s). Add a knowledge check so each area is validated.`,
      apply: { action: "copilot", copilotAction: "generate-questions" },
    });
  }

  // A procedure with no simulation loses the "practise" value.
  if (kind === "procedure") {
    const simSteps = course.simulation?.steps?.length ?? 0;
    if (simSteps === 0) {
      hints.push({
        id: "hint-add-sim",
        type: "add-simulation",
        severity: "suggestion",
        target: { kind: "simulation", id: course.simulation?.id ?? "simulation" },
        message: "This procedure has no simulation. Add a simulation step so learners can practise safely.",
        apply: { action: "regenerate-simulation" },
      });
    }
  }

  // Missing objective on the programme.
  if (!course.programme?.title || /\b(Understand|Why|Practise|Prove)\s*$/.test(String(course.programme?.title ?? "").trim())) {
    hints.push({
      id: "hint-objective",
      type: "objective-missing",
      severity: "warning",
      target: { kind: "programme", id: course.programme?.id ?? "programme" },
      message: "The programme is missing a clear objective. Add one so learners know the outcome.",
      apply: { action: "copilot", copilotAction: "objective" },
    });
  }

  return hints;
}

// Grounded span extraction: return short verbatim snippets from the source
// that relate to a target text, so every AI suggestion can cite where it came
// from. Deterministic and case-insensitive.
export function citeSpans(source, targetText, { max = 3 } = {}) {
  const haystack = String(source?.extractedText ?? "");
  if (!haystack) return [];
  const words = [...new Set(String(targetText ?? "").toLowerCase().match(/[a-z]{5,}/g) ?? [])].slice(0, 12);
  const sentences = haystack.replace(/\s+/g, " ").split(/(?<=[.!?])\s+/);
  const scored = sentences
    .map((sentence) => ({ sentence: sentence.trim(), score: words.reduce((sum, word) => sum + (sentence.toLowerCase().includes(word) ? 1 : 0), 0) }))
    .filter((entry) => entry.sentence.length > 20 && entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, max);
  return scored.map((entry) => entry.sentence.slice(0, 240));
}

// Grounded comprehension quiz for a section/selection: correct answer is the
// matching section subject, distractors are sibling subjects from the same
// document (relevant, and every option comes from the source).
export function quizFromOutline(source, { count = 3, near = "" } = {}) {
  const outline = resolveOutline(source)
    .map((entry) => ({ ...describeSection(entry.section), heading: entry.section }))
    .filter((entry) => entry.subject && entry.subject.length >= 4);
  if (outline.length < 2) return [];
  // Prefer sections whose subject relates to the selection text.
  const nearLower = String(near ?? "").toLowerCase();
  const ordered = nearLower
    ? [...outline].sort((a, b) => (nearLower.includes(b.subject.toLowerCase()) ? 1 : 0) - (nearLower.includes(a.subject.toLowerCase()) ? 1 : 0))
    : outline;
  return ordered.slice(0, count).map((entry, index) => {
    const siblings = outline.filter((other) => other.subject !== entry.subject).map((other) => other.subject);
    const seen = new Set([entry.subject.toLowerCase()]);
    const distractors = [];
    for (let i = 0; i < siblings.length && distractors.length < 3; i += 1) {
      const value = siblings[(index + i) % siblings.length];
      if (!seen.has(value.toLowerCase())) { seen.add(value.toLowerCase()); distractors.push(value); }
    }
    return {
      id: `copilot-q-${index + 1}`,
      question: entry.numbered
        ? `Which subject is addressed by ${entry.ref} of "${source.title}"?`
        : `Which of the following subjects does "${source.title}" specifically address?`,
      options: [entry.subject, ...distractors],
      correct: 0,
      citation: { sourceId: source.id, title: source.title, version: source.version, section: entry.heading },
    };
  });
}

const JARGON = [
  [/\bdefinitionJson\b/gi, "definition"],
  [/\badapter\b/gi, "connector"],
  [/\bRBAC\b/g, "role-based access"],
  [/\bprovision(ing)?\b/gi, "set up"],
  [/\butilise\b/gi, "use"],
  [/\bcommence\b/gi, "start"],
  [/\bterminate\b/gi, "end"],
  [/\bpursuant to\b/gi, "under"],
  [/\bin accordance with\b/gi, "following"],
  [/\bnotwithstanding\b/gi, "despite"],
];

// Deterministic copilot fallback (used when no key / model fails). Grounded to
// the supplied source; returns text + cited spans, never publishes.
export function copilotFallback({ action, text = "", source = {} }) {
  const spans = citeSpans(source, text || source.explanation || "");
  const citation = { sourceId: source.id, title: source.title, version: source.version, section: source.section };
  if (action === "make-concise") {
    const sentences = String(text).replace(/\s+/g, " ").split(/(?<=[.!?])\s+/).filter(Boolean);
    const output = sentences.slice(0, 2).join(" ").slice(0, 400) || firstSentence(source.explanation || "");
    return { ok: true, action, output, citations: [citation], spans, engine: "deterministic" };
  }
  if (action === "rewrite-nontechnical") {
    let output = String(text || source.explanation || "");
    for (const [pattern, replacement] of JARGON) output = output.replace(pattern, replacement);
    return { ok: true, action, output: output.slice(0, 600), citations: [citation], spans, engine: "deterministic" };
  }
  if (action === "expand" || action === "objective") {
    const output = firstSentence(source.explanation || text, 220) || `Grounded summary of ${topicLabel(source)}.`;
    return { ok: true, action, output, citations: [citation], spans, engine: "deterministic" };
  }
  if (action === "generate-questions") {
    const questions = quizFromOutline(source, { count: 3, near: text });
    return { ok: true, action, questions, citations: [citation], spans, engine: "deterministic" };
  }
  return { ok: true, action, output: String(text).slice(0, 400), citations: [citation], spans, engine: "deterministic" };
}
