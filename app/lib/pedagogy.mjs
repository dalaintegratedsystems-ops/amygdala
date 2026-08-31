// Pedagogy-aware generation helpers (deterministic, grounded).
//
// Layered on top of the deterministic authoring engine, these add the
// instructional-design quality that raw docs->course lacks:
//  - per-module learning objectives tagged with a Bloom's-taxonomy level,
//  - a VARIETY of grounded question types (multiple choice, definition-match,
//    true/false) instead of one shape,
//  - a rationale + per-answer feedback and a difficulty tier on every item.
//
// Everything is grounded to the approved source (options/definitions are
// copied from the typed knowledge model, which is span-verified) and stays
// Draft/Pending — this only enriches a course the human still approves.

const BLOOM_BY_DIFFICULTY = {
  Introductory: { level: "Remember", verb: "Recall" },
  Intermediate: { level: "Understand", verb: "Explain" },
  Advanced: { level: "Apply", verb: "Apply" },
};

const DIFFICULTY_TIERS = ["Introductory", "Intermediate", "Advanced"];

export function difficultyForIndex(index) {
  return DIFFICULTY_TIERS[Math.min(index, DIFFICULTY_TIERS.length - 1)];
}

export function bloomFor(difficulty) {
  return BLOOM_BY_DIFFICULTY[difficulty] ?? BLOOM_BY_DIFFICULTY.Intermediate;
}

// A Bloom-tagged learning objective for a module subject.
export function bloomObjective(subject, difficulty = "Intermediate") {
  const bloom = bloomFor(difficulty);
  const clean = String(subject ?? "this topic").replace(/\s+/g, " ").trim() || "this topic";
  const lead = /^the\b/i.test(clean) ? clean : `the provisions on ${clean.charAt(0).toLowerCase()}${clean.slice(1)}`;
  return { text: `${bloom.verb} ${lead}.`, bloom: bloom.level, difficulty };
}

function citationOf(source, section) {
  return { sourceId: source.id, title: source.title, version: source.version, section: section || source.section };
}

// Per-answer feedback: a short, grounded coaching line for each option.
function optionFeedback(options, correctIndex, correctFeedback, wrongFeedback) {
  return options.map((option, index) => ({
    option,
    correct: index === correctIndex,
    feedback: index === correctIndex ? correctFeedback : wrongFeedback,
  }));
}

function pickSiblings(correct, pool, count) {
  const seen = new Set([String(correct).toLowerCase()]);
  const chosen = [];
  for (const candidate of pool) {
    const value = String(candidate ?? "").replace(/\s+/g, " ").trim();
    const key = value.toLowerCase();
    if (!value || value.length < 3 || seen.has(key)) continue;
    seen.add(key);
    chosen.push(value);
    if (chosen.length >= count) break;
  }
  return chosen;
}

// Definition-match questions from the typed knowledge model. Grounded: both the
// correct definition and the distractors are copied from the document.
export function definitionQuestions(source, typed, { count = 3 } = {}) {
  const definitions = Array.isArray(typed?.definitions) ? typed.definitions : [];
  if (definitions.length < 2) return [];
  const allDefs = definitions.map((entry) => entry.definition);
  return definitions.slice(0, count).map((entry, index) => {
    const distractors = pickSiblings(entry.definition, allDefs.filter((_, i) => i !== index), 3);
    const options = [entry.definition, ...distractors];
    const difficulty = difficultyForIndex(index);
    const bloom = bloomFor(difficulty);
    return {
      id: `ped-def-${source.id}-q${index + 1}`,
      type: "definition",
      question: `In "${source.title}", what does "${entry.term}" mean?`,
      options,
      correct: 0,
      rationale: `"${source.title}" defines "${entry.term}" as: ${entry.definition}.`,
      optionFeedback: optionFeedback(options, 0, `Correct — that is the definition of "${entry.term}".`, `That is a different defined term. Re-read the definition of "${entry.term}".`),
      difficulty,
      bloom: bloom.level,
      citation: citationOf(source),
    };
  });
}

// True/false comprehension items from definitions (alternating truth value).
export function trueFalseQuestions(source, typed, { count = 2 } = {}) {
  const definitions = Array.isArray(typed?.definitions) ? typed.definitions : [];
  if (definitions.length < 2) return [];
  return definitions.slice(0, count).map((entry, index) => {
    const isTrue = index % 2 === 0;
    const other = definitions[(index + 1) % definitions.length];
    const statement = isTrue
      ? `In "${source.title}", "${entry.term}" means ${entry.definition}.`
      : `In "${source.title}", "${entry.term}" means ${other.definition}.`;
    const options = ["True", "False"];
    const correct = isTrue ? 0 : 1;
    const difficulty = difficultyForIndex(index + 1);
    const bloom = bloomFor(difficulty);
    return {
      id: `ped-tf-${source.id}-q${index + 1}`,
      type: "true-false",
      question: statement,
      options,
      correct,
      rationale: `The approved definition of "${entry.term}" is: ${entry.definition}.`,
      optionFeedback: optionFeedback(options, correct, "Correct — this matches the approved definition.", "Re-read the approved definition; the statement does not match it."),
      difficulty,
      bloom: bloom.level,
      citation: citationOf(source),
    };
  });
}

// Add a grounded rationale, per-answer feedback, difficulty tier and Bloom
// level to an existing (already grounded) question. Preserves its options,
// correct index and citation.
export function annotateQuestion(question, source, index = 0) {
  const difficulty = difficultyForIndex(index);
  const bloom = bloomFor(difficulty);
  const correctIndex = question.correct ?? 0;
  const correctOption = question.options?.[correctIndex] ?? "";
  const section = question.citation?.section || source.section;
  return {
    ...question,
    type: question.type ?? "multiple-choice",
    rationale: question.rationale ?? `Grounded in "${source.title}"${section ? ` · ${section}` : ""}: the approved answer is "${correctOption}".`,
    optionFeedback: question.optionFeedback ?? optionFeedback(question.options ?? [], correctIndex, "Correct — this is drawn directly from the approved source.", "Not the approved answer — review the cited section of the source."),
    difficulty: question.difficulty ?? difficulty,
    bloom: question.bloom ?? bloom.level,
  };
}

// Enrich a generated course with pedagogy: Bloom-tagged module objectives,
// annotated existing questions, and a variety of grounded question types drawn
// from the typed knowledge model. Everything stays Draft/Pending.
export function enrichCoursePedagogy(course, source, typed) {
  if (!course || course.ok === false) return course;
  const safeTyped = typed && typeof typed === "object" ? typed : {};

  const modules = (course.modules ?? []).map((module, index) => {
    const difficulty = /validate|prove/i.test(module.title ?? "") ? "Advanced" : difficultyForIndex(index);
    const objective = bloomObjective(module.title ?? "", difficulty);
    return { ...module, objective: module.objective ?? objective.text, bloom: objective.bloom, difficulty };
  });

  const existing = (course.assessment?.questions ?? []).map((question, index) => annotateQuestion(question, source, index));
  const extras = [...definitionQuestions(source, safeTyped, { count: 3 }), ...trueFalseQuestions(source, safeTyped, { count: 2 })];
  // De-duplicate by question text so regeneration stays stable.
  const seen = new Set(existing.map((question) => question.question));
  const merged = [...existing];
  for (const question of extras) {
    if (seen.has(question.question)) continue;
    seen.add(question.question);
    merged.push(question);
  }

  const questionTypes = [...new Set(merged.map((question) => question.type))];
  return {
    ...course,
    modules,
    assessment: { ...course.assessment, questions: merged },
    pedagogy: {
      objectives: modules.filter((module) => module.objective).map((module) => ({ moduleId: module.id, objective: module.objective, bloom: module.bloom, difficulty: module.difficulty })),
      questionTypes,
      questionCount: merged.length,
      shapes: Array.isArray(safeTyped.shapes) ? safeTyped.shapes : [],
    },
  };
}
