// Deterministic, grounded docs -> course generation engine.
//
// Turns an approved source document into a full draft training course
// (programme, modules, lessons, diagnostic, assessment and a simulation
// definition). Every generated artefact carries a citation back to the
// exact source version/section and enters the human review workflow as
// Draft / Pending so a vendor administrator approves before publish.
//
// The generator is intentionally deterministic (no LLM, no credentials):
// the same source always yields the same draft, which keeps the pipeline
// auditable and testable. `ai.mjs` layers a grounded LLM upgrade on top.
//
// It ADAPTS to the document:
//  - a "procedure" (ordered actions) becomes a learn/practise/validate
//    pathway with a step-by-step simulation;
//  - a "reference" document (policy, statute, definitions) becomes a
//    multi-section knowledge course whose modules/lessons/assessment cover
//    the whole document rather than a single truncated slice.

import { outlineDocument, deriveDocumentType } from "./ingest.mjs";

const GENERATOR_ID = "amygdala-deterministic-authoring/v2";

function slugify(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 48) || "course";
}

function citationFor(source, section) {
  return {
    sourceId: source.id,
    title: source.title,
    version: source.version,
    section: section || source.section,
  };
}

// A label that reads like a gazette / document code rather than a topic
// (e.g. "NO. 84 OF 1996") — poor as a human-facing title.
function isCodeLike(value) {
  const text = String(value ?? "").trim();
  if (/^no\.?\s*\d+(\s*of\s*\d+)?$/i.test(text)) return true;
  const letters = text.replace(/[^A-Za-z]/g, "");
  return Boolean(/\d/.test(text) && letters && letters === letters.toUpperCase());
}

// A clean, human topic label for titles. Prefers module, then section, then
// title, and never yields an empty string, a code, or a dangling separator.
export function topicLabel(source) {
  const banned = new Set(["", "unassigned", "imported content", "awaiting review", "general", "untitled source", "imported source"]);
  const candidates = [source?.module, source?.section, source?.title]
    .map((candidate) => String(candidate ?? "").replace(/\s+/g, " ").replace(/[.\u2014\-–:;,]+$/, "").trim())
    .filter((candidate) => candidate && !banned.has(candidate.toLowerCase()) && !isCodeLike(candidate));
  // Prefer a mixed-case, human-readable candidate over a shouty ALL-CAPS one.
  const mixedCase = candidates.find((candidate) => /[a-z]/.test(candidate));
  if (mixedCase) return mixedCase;
  if (candidates.length) return candidates[0];
  const title = String(source?.title ?? "").replace(/\s+/g, " ").trim();
  return title || "this topic";
}

// Sections that make good module / lesson / question material: real subjects,
// not gazette codes or bare chapter dividers ("LEARNERS", "CHAPTER 2").
function usableSections(outline) {
  return outline.filter((entry) => {
    const { subject, numbered } = describeSection(entry.section);
    if (!subject || subject.length < 4) return false;
    if (isCodeLike(subject)) return false;
    if (/^(chapter|part|schedule|arrangement)\b/i.test(subject)) return false;
    const letters = subject.replace(/[^A-Za-z]/g, "");
    if (!numbered && letters && letters === letters.toUpperCase()) return false;
    return true;
  });
}

// Lower-cased label for mid-sentence use (keeps acronyms/section codes intact).
function topicLabelLower(source) {
  const label = topicLabel(source);
  // Do not lowercase labels that are mostly uppercase (acronyms, "NO. 84").
  const letters = label.replace(/[^A-Za-z]/g, "");
  if (letters && letters === letters.toUpperCase()) return label;
  return label.charAt(0).toLowerCase() + label.slice(1);
}

// Split a (possibly legal-numbered) heading into a reference + subject, e.g.
// "5A. Admission to public schools" -> { ref: "section 5A", subject: "Admission to public schools" }.
function describeSection(heading) {
  const match = String(heading ?? "").match(/^(\d{1,3}[A-Z]?)\.\s+(.+)$/);
  if (match) return { ref: `section ${match[1]}`, subject: match[2].replace(/\s+/g, " ").trim(), numbered: true };
  const subject = String(heading ?? "").replace(/\s+/g, " ").trim();
  return { ref: subject ? `the part on ${subject}` : "this part", subject: subject || "this topic", numbered: false };
}

function isGeneratable(source) {
  if (!source || source.status !== "Published" || source.approvalStatus !== "Approved") return false;
  const hasProcedure = Array.isArray(source.procedure) && source.procedure.length > 0;
  const hasOutline = Array.isArray(source.outline) && source.outline.length >= 1;
  const hasText = typeof source.extractedText === "string" && source.extractedText.trim().length >= 120;
  return hasProcedure || hasOutline || hasText;
}

// Resolve the document outline (persisted, or reconstructed from stored text).
function resolveOutline(source) {
  if (Array.isArray(source.outline) && source.outline.length) return source.outline;
  if (typeof source.extractedText === "string" && source.extractedText.length > 200) {
    return outlineDocument(source.extractedText);
  }
  return [];
}

function resolveKind(source) {
  if (source.documentType === "procedure" || source.documentType === "reference") return source.documentType;
  if (Array.isArray(source.procedure) && source.procedure.length >= 3) return "procedure";
  if (typeof source.extractedText === "string" && source.extractedText.length > 200) return deriveDocumentType(source.extractedText, source.procedure ?? []);
  return Array.isArray(source.procedure) && source.procedure.length > 0 ? "procedure" : "reference";
}

// Pick up to `count` relevant distractors for a correct option, drawn from
// SIBLING content (other steps / section subjects / keywords of the same
// document). Deterministic and never generic SaaS boilerplate.
function pickDistractors(correct, pool, { count = 2, seed = 0 } = {}) {
  const normalizedCorrect = String(correct).toLowerCase().trim();
  const seen = new Set([normalizedCorrect]);
  const unique = [];
  for (const candidate of pool) {
    const value = String(candidate ?? "").replace(/\s+/g, " ").trim();
    const key = value.toLowerCase();
    if (!value || value.length < 3 || seen.has(key)) continue;
    seen.add(key);
    unique.push(value);
  }
  if (unique.length === 0) return [];
  const chosen = [];
  for (let i = 0; i < count && chosen.length < unique.length; i += 1) {
    chosen.push(unique[(seed + i) % unique.length]);
  }
  return [...new Set(chosen)].slice(0, count);
}

// Procedure questions: "which is step N of the approved procedure?" with
// distractors taken from the OTHER approved steps (relevant, grounded).
function deriveProcedureQuestions(source, { prefix, count }) {
  const steps = source.procedure;
  const label = topicLabel(source);
  return steps.slice(0, count).map((step, index) => {
    const siblingSteps = steps.filter((_, i) => i !== index);
    const keywordPhrases = (source.keywords ?? []).map((keyword) => `Something about ${keyword}`);
    const distractors = pickDistractors(step, [...siblingSteps, ...keywordPhrases], { count: 2, seed: index });
    const options = [step, ...distractors];
    return {
      id: `${prefix}-${source.id}-q${index + 1}`,
      question: `In the approved "${label}" procedure, which of the following is step ${index + 1}?`,
      options,
      correct: 0,
      citation: citationFor(source),
    };
  });
}

// Reference questions: pair a section identifier with its subject; distractors
// are the subjects of OTHER (sibling) sections — relevant and genuinely wrong
// for the stem, and grounded because every subject comes from the document.
function deriveReferenceQuestions(source, outline, { prefix, count }) {
  const usable = outline
    .map((entry) => ({ ...describeSection(entry.section), heading: entry.section }))
    .filter((entry) => entry.subject && entry.subject.length >= 3);
  const title = source.title;
  return usable.slice(0, count).map((entry, index) => {
    const siblingSubjects = usable.filter((_, i) => i !== index).map((sibling) => sibling.subject);
    const distractors = pickDistractors(entry.subject, siblingSubjects, { count: 3, seed: index });
    const options = [entry.subject, ...distractors];
    const stem = entry.numbered
      ? `Which subject is addressed by ${entry.ref} of "${title}"?`
      : `Which of the following subjects does "${title}" specifically address?`;
    return {
      id: `${prefix}-${source.id}-q${index + 1}`,
      question: stem,
      options,
      correct: 0,
      citation: citationFor(source, entry.heading),
    };
  });
}

function draftLessonBody(source) {
  const steps = source.procedure.map((step, index) => `${index + 1}. ${step}`).join("\n");
  return { concept: source.explanation, procedure: steps };
}

function generateProcedureCourse(source) {
  const label = topicLabel(source);
  const labelLower = topicLabelLower(source);
  const base = slugify(source.module || source.title);
  const role = source.intendedRole && source.intendedRole !== "All roles" ? source.intendedRole : "Project Manager";
  const citation = citationFor(source);
  const body = draftLessonBody(source);

  const programme = {
    id: `prog-${base}`,
    title: `${label}: grounded onboarding`,
    role,
    kind: "procedure",
    status: "Draft",
    approvalStatus: "Pending",
    sourceId: source.id,
    citation,
  };

  const modules = [
    { id: `mod-${base}-learn`, label: "Learn", title: `Understand ${labelLower}`, duration: 6, mandatory: true, citation },
    { id: `mod-${base}-practise`, label: "Practise", title: `Practise ${labelLower}`, duration: 10, mandatory: true, citation },
    { id: `mod-${base}-validate`, label: "Validate", title: `Prove ${labelLower} readiness`, duration: 6, mandatory: true, citation },
  ];

  const lessons = [
    { id: `les-${base}-concept`, moduleId: `mod-${base}-learn`, label: "Learn", title: `Why ${labelLower} matters`, content: body.concept, citation },
    { id: `les-${base}-procedure`, moduleId: `mod-${base}-practise`, label: "Practise", title: `The approved ${labelLower} procedure`, content: body.procedure, citation },
  ];

  const diagnostic = deriveProcedureQuestions(source, { prefix: "diag", count: Math.min(3, source.procedure.length) });
  const assessment = {
    id: `asmt-${base}`,
    passThreshold: 80,
    questions: deriveProcedureQuestions(source, { prefix: "asmt", count: Math.min(5, source.procedure.length) }),
    citation,
  };

  const simulation = {
    id: `sim-${base}`,
    moduleId: `mod-${base}-practise`,
    title: `Practise: ${label}`,
    kind: "procedure",
    prompt: "Choose the correct approved action.",
    citation,
    steps: source.procedure.map((step, index) => ({
      label: step,
      hint: `Approved step ${index + 1} of ${source.procedure.length}.`,
      coaching: `That is not the approved next action. Return to "${source.title}" and follow step ${index + 1}.`,
    })),
  };

  return { programme, modules, lessons, diagnostic, assessment, simulation, citation, coverage: null };
}

function generateReferenceCourse(source) {
  const label = topicLabel(source);
  const base = slugify(source.module || source.title);
  const role = source.intendedRole && source.intendedRole !== "All roles" ? source.intendedRole : "All roles";
  const citation = citationFor(source);
  const rawOutline = resolveOutline(source);
  const outline = usableSections(rawOutline);

  const maxModules = 8;
  const maxLessons = 12;
  const covered = outline.slice(0, Math.max(maxModules, maxLessons));

  const programme = {
    id: `prog-${base}`,
    title: `${label}: grounded onboarding`,
    role,
    kind: "reference",
    status: "Draft",
    approvalStatus: "Pending",
    sourceId: source.id,
    citation,
  };

  const modules = covered.slice(0, maxModules).map((entry, index) => {
    const { subject } = describeSection(entry.section);
    return {
      id: `mod-${base}-${index + 1}`,
      label: "Learn",
      title: subject,
      duration: Math.max(4, Math.min(12, Math.round(entry.charCount / 350))),
      mandatory: true,
      citation: citationFor(source, entry.section),
    };
  });
  // A closing validation module frames the assessment.
  modules.push({ id: `mod-${base}-validate`, label: "Validate", title: `Prove understanding of ${label}`, duration: 8, mandatory: true, citation });

  const lessons = covered.slice(0, maxLessons).map((entry, index) => {
    const { subject } = describeSection(entry.section);
    return {
      id: `les-${base}-${index + 1}`,
      moduleId: modules[Math.min(index, modules.length - 2)]?.id ?? modules[0].id,
      label: "Learn",
      title: subject,
      content: entry.summary,
      citation: citationFor(source, entry.section),
    };
  });
  if (lessons.length === 0) {
    lessons.push({ id: `les-${base}-overview`, moduleId: modules[0].id, label: "Learn", title: `Understand ${label}`, content: source.explanation, citation });
  }

  const diagnostic = deriveReferenceQuestions(source, outline, { prefix: "diag", count: Math.min(3, Math.max(1, outline.length)) });
  const assessment = {
    id: `asmt-${base}`,
    passThreshold: 80,
    questions: deriveReferenceQuestions(source, outline, { prefix: "asmt", count: Math.min(8, Math.max(1, outline.length)) }),
    citation,
  };

  // A guided review "simulation": rehearse locating the right section, not a
  // production workflow. Steps are the covered section subjects, in order.
  const reviewSteps = (covered.length ? covered : outline).slice(0, 8).map((entry, index, all) => {
    const { subject } = describeSection(entry.section);
    return {
      label: subject,
      hint: `Part ${index + 1} of ${all.length} in "${source.title}".`,
      coaching: `Not the section under review. Return to "${source.title}" and open ${describeSection(entry.section).ref}.`,
    };
  });
  const simulation = {
    id: `sim-${base}`,
    moduleId: modules[0].id,
    title: `Guided review: ${label}`,
    kind: "review",
    prompt: "Select the correct section to review next.",
    citation,
    steps: reviewSteps.length ? reviewSteps : [{ label: label, hint: `Review "${source.title}".`, coaching: `Return to "${source.title}".` }],
  };

  const coverage = source.coverage
    ? { ...source.coverage, sectionsCovered: covered.length, sectionsTotal: outline.length, outlineSectionsRaw: rawOutline.length }
    : { sectionsCovered: covered.length, sectionsTotal: outline.length, outlineSectionsRaw: rawOutline.length };

  return { programme, modules, lessons, diagnostic, assessment, simulation, citation, coverage };
}

// Generate a complete, grounded draft course from one approved source.
export function generateCourseFromSource(source, options = {}) {
  if (!isGeneratable(source)) {
    return {
      ok: false,
      reason: "source-not-approved",
      message:
        "Course generation requires a Published + Approved source with extractable knowledge (a procedure, an outline, or substantial text).",
    };
  }

  const kind = resolveKind(source);
  const built = kind === "procedure" && Array.isArray(source.procedure) && source.procedure.length > 0
    ? generateProcedureCourse(source)
    : generateReferenceCourse(source);

  const provenance = {
    generator: GENERATOR_ID,
    grounded: true,
    kind: built.programme.kind,
    sourceId: source.id,
    sourceVersion: source.version,
    sourceSection: source.section,
    generatedAt: options.generatedAt ?? null,
  };

  return {
    ok: true,
    kind: built.programme.kind,
    programme: built.programme,
    modules: built.modules,
    lessons: built.lessons,
    diagnostic: built.diagnostic,
    assessment: built.assessment,
    simulation: built.simulation,
    citation: built.citation,
    coverage: built.coverage,
    provenance,
    reviewChecklist: [
      "Confirm every lesson matches the cited source section.",
      "Confirm the assessment pass threshold (80%) is correct for this role.",
      built.programme.kind === "procedure"
        ? "Confirm the simulation steps follow the approved procedure order."
        : "Confirm the modules cover the document's key sections in a sensible order.",
      "Approve to publish, or reject to return for edits.",
    ],
  };
}

// Summary counts for a generated (or published) course.
export function summariseGeneratedCourse(course) {
  if (!course || course.ok === false) return { modules: 0, lessons: 0, diagnostic: 0, assessment: 0, simulationSteps: 0 };
  return {
    modules: course.modules.length,
    lessons: course.lessons.length,
    diagnostic: course.diagnostic.length,
    assessment: course.assessment.questions.length,
    simulationSteps: course.simulation.steps.length,
  };
}

// Human-in-the-loop approval: returns a published copy of the draft course.
// Everything a vendor administrator approves flips to Published / Approved.
export function approveCourse(course) {
  if (!course || course.ok === false) return course;
  const publish = (item) => ({ ...item, status: "Published", approvalStatus: "Approved" });
  return {
    ...course,
    programme: publish(course.programme),
    modules: course.modules.map((module) => ({ ...module, status: "Published", approvalStatus: "Approved" })),
    lessons: course.lessons.map((lesson) => ({ ...lesson, status: "Published", approvalStatus: "Approved" })),
    approvalStatus: "Approved",
    status: "Published",
  };
}
