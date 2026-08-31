// Grounding, confidence & review tooling.
//
// Given an approved source and a generated course, compute:
//  - a coverage metric: how much of the source's structure the course teaches,
//  - a grounded-claim check: which generated sentences are supported by the
//    source text (token-overlap grounding) and which look unsupported, and
//  - a per-item confidence score the UI surfaces next to lessons/questions.
//
// Deterministic and dependency-light so it is unit-testable offline. This is a
// review AID for the human author — it never blocks or auto-edits content.

function normalize(text) {
  return String(text ?? "").replace(/\s+/g, " ").trim();
}

const STOP = new Set(["the", "and", "for", "with", "that", "this", "from", "into", "your", "you", "are", "was", "will", "have", "has", "not", "but", "can", "may", "any", "all", "our", "their", "its", "of", "to", "in", "on", "or", "is", "it", "be", "as", "at", "by", "if", "so", "do", "a", "an", "which", "must", "shall", "under", "section", "act"]);

function contentTokens(text) {
  return (normalize(text).toLowerCase().match(/[a-z][a-z0-9-]{2,}/g) ?? []).filter((token) => !STOP.has(token));
}

function splitSentences(text) {
  return normalize(text).split(/(?<=[.!?;])\s+/).map((sentence) => sentence.trim()).filter((sentence) => sentence.length > 0);
}

// Fraction of a sentence's content words that appear in the source vocabulary.
export function groundingScore(sentence, sourceVocab) {
  const tokens = contentTokens(sentence);
  if (tokens.length === 0) return 1;
  let hits = 0;
  for (const token of tokens) if (sourceVocab.has(token)) hits += 1;
  return hits / tokens.length;
}

// Pull the human-readable text a course teaches: lesson content + block text.
function lessonText(lesson) {
  const blocks = Array.isArray(lesson?.blocks) ? lesson.blocks : [];
  const fromBlocks = blocks
    .map((block) => block?.text ?? block?.question ?? (Array.isArray(block?.steps) ? block.steps.join(". ") : "") ?? "")
    .filter(Boolean)
    .join(" ");
  return normalize(`${lesson?.content ?? ""} ${fromBlocks}`);
}

// Which outline section subjects the course cites / teaches.
function coveredSections(source, course) {
  const outline = Array.isArray(source?.outline) ? source.outline : [];
  const total = outline.length;
  if (total === 0) return { sectionsCovered: 0, sectionsTotal: 0 };
  const citedSections = new Set();
  for (const lesson of course?.lessons ?? []) {
    if (lesson?.citation?.section) citedSections.add(normalize(lesson.citation.section).toLowerCase());
    if (lesson?.title) citedSections.add(normalize(lesson.title).toLowerCase());
  }
  for (const courseModule of course?.modules ?? []) {
    if (courseModule?.title) citedSections.add(normalize(courseModule.title).toLowerCase());
  }
  let covered = 0;
  for (const entry of outline) {
    const subject = normalize(String(entry.section).replace(/^\d{1,3}[A-Z]?\.\s+/, "")).toLowerCase();
    const heading = normalize(entry.section).toLowerCase();
    if (citedSections.has(subject) || citedSections.has(heading) || [...citedSections].some((cited) => cited.includes(subject) && subject.length > 4)) covered += 1;
  }
  return { sectionsCovered: covered, sectionsTotal: total };
}

// Main entry: assess coverage, grounded claims and per-item confidence.
export function assessCourseCoverage(source, course, { threshold = 0.5, maxClaims = 8 } = {}) {
  const sourceVocab = new Set(contentTokens(source?.extractedText ?? ""));

  const { sectionsCovered, sectionsTotal } = coveredSections(source, course);
  const coveragePercent = sectionsTotal > 0 ? Math.round((sectionsCovered / sectionsTotal) * 100) : 0;

  let totalClaims = 0;
  let groundedClaims = 0;
  const ungrounded = [];
  const lessonConfidence = [];

  for (const lesson of course?.lessons ?? []) {
    const sentences = splitSentences(lessonText(lesson));
    let lessonGrounded = 0;
    for (const sentence of sentences) {
      const score = groundingScore(sentence, sourceVocab);
      totalClaims += 1;
      if (score >= threshold) {
        groundedClaims += 1;
        lessonGrounded += 1;
      } else if (ungrounded.length < maxClaims && contentTokens(sentence).length >= 4) {
        ungrounded.push({ where: lesson.title ?? lesson.id, text: sentence.slice(0, 200), score: Number(score.toFixed(2)) });
      }
    }
    const confidence = sentences.length ? lessonGrounded / sentences.length : (lesson?.citation ? 1 : 0);
    lessonConfidence.push({ id: lesson.id, title: lesson.title, confidence: Number(confidence.toFixed(2)) });
  }

  const questionConfidence = (course?.assessment?.questions ?? []).map((question) => {
    const correctOption = question.options?.[question.correct ?? 0] ?? "";
    const score = groundingScore(correctOption, sourceVocab);
    const hasCitation = Boolean(question.citation?.sourceId);
    const confidence = Math.min(1, score * 0.7 + (hasCitation ? 0.3 : 0));
    return { id: question.id, confidence: Number(confidence.toFixed(2)) };
  });

  const groundedRatio = totalClaims > 0 ? groundedClaims / totalClaims : 1;
  const confidenceValues = [...lessonConfidence.map((entry) => entry.confidence), ...questionConfidence.map((entry) => entry.confidence)];
  const averageConfidence = confidenceValues.length ? confidenceValues.reduce((sum, value) => sum + value, 0) / confidenceValues.length : 0;

  return {
    coveragePercent,
    sectionsCovered,
    sectionsTotal,
    claims: {
      total: totalClaims,
      grounded: groundedClaims,
      groundedRatio: Number(groundedRatio.toFixed(2)),
      ungrounded,
    },
    confidence: {
      average: Number(averageConfidence.toFixed(2)),
      lessons: lessonConfidence,
      questions: questionConfidence,
    },
  };
}
