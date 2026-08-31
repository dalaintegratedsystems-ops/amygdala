// Structure-aware extraction: a typed knowledge model per source.
//
// Alongside the flat chunks + procedure the ingester already derives, this
// produces a small typed model — concepts, definitions, procedures and key
// entities — used to drive the RIGHT training shape in generation (e.g. a
// document rich in definitions gets "match the definition" items; a procedure
// gets ordered-step items).
//
// Everything is deterministic and span-grounded: every emitted item is copied
// from the source text (or an outline derived from it), so nothing is
// hallucinated. Pure functions, so it is unit-testable offline.

import { deriveKeywords, outlineDocument, verifyGrounding } from "./ingest.mjs";

function normalize(text) {
  return String(text ?? "").replace(/\s+/g, " ").trim();
}

// Split a (possibly legal-numbered) heading into a human subject.
function sectionSubject(heading) {
  const match = String(heading ?? "").match(/^(\d{1,3}[A-Z]?)\.\s+(.+)$/);
  const subject = match ? match[2] : String(heading ?? "");
  return normalize(subject);
}

// Definitions: statute / policy "term means …" clauses (the single richest
// signal in reference documents). Handles quoted and unquoted terms and the
// legal "means—" convention, splitting the definitions block on ; and .
export function extractDefinitions(text, { max = 16 } = {}) {
  const normalized = normalize(text);
  const defs = [];
  const seen = new Set();
  const add = (rawTerm, rawDefinition) => {
    const term = String(rawTerm).replace(/["'“”‘’]/g, "").trim();
    const definition = String(rawDefinition).replace(/["'“”]/g, "").trim().replace(/[;.]+$/, "");
    const key = term.toLowerCase();
    if (term.length < 2 || definition.length < 8 || seen.has(key)) return;
    seen.add(key);
    defs.push({ term, definition: definition.slice(0, 240) });
  };

  // Primary signal: quoted defined terms ("learner" means …), the standard
  // statute/policy convention. The definition runs to the next ; or .
  const quoted = /["'“”‘’]([A-Za-z][^"'“”‘’]{1,60}?)["'“”‘’]\s+means\b[,:]?\s*[—–-]?\s*([^;.]{8,240})/gi;
  let match;
  while ((match = quoted.exec(normalized)) && defs.length < max) add(match[1], match[2]);

  // Fallback for unquoted "Term means …" when few quoted terms were found.
  if (defs.length < 2) {
    const unquoted = /(?:^|[;.]\s+)([A-Z][A-Za-z]+(?:\s+[A-Za-z]+){0,3})\s+means\b[,:]?\s*[—–-]?\s*([^;.]{8,240})/g;
    while ((match = unquoted.exec(normalized)) && defs.length < max) add(match[1], match[2]);
  }
  return defs;
}

// Key entities: the defined terms plus recurring proper-noun phrases, ranked by
// frequency. Grounded (each appears verbatim in the source).
export function extractEntities(text, definitions = [], { max = 12 } = {}) {
  const normalized = normalize(text);
  const counts = new Map();
  for (const match of normalized.match(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})\b/g) ?? []) {
    const value = match.trim();
    if (value.split(/\s+/).length < 2) continue;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  const frequent = [...counts.entries()]
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([value]) => value);
  const defTerms = definitions.map((entry) => entry.term).filter((term) => /[a-z]/.test(term));
  const merged = [];
  const seen = new Set();
  for (const value of [...defTerms, ...frequent]) {
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(value);
    if (merged.length >= max) break;
  }
  return merged;
}

// Concepts: the substantive section subjects (from the outline) plus salient
// keywords, as short human-readable labels.
export function extractConcepts(text, { outline, keywords = [], max = 12 } = {}) {
  const resolvedOutline = Array.isArray(outline) && outline.length ? outline : outlineDocument(text);
  const concepts = [];
  const seen = new Set();
  for (const entry of resolvedOutline) {
    const subject = sectionSubject(entry.section);
    const key = subject.toLowerCase();
    if (subject.length < 4 || seen.has(key)) continue;
    if (/^(chapter|part|schedule|arrangement|general)\b/i.test(subject)) continue;
    seen.add(key);
    concepts.push(subject);
    if (concepts.length >= max) break;
  }
  if (concepts.length < 3) {
    const fallbackKeywords = keywords.length ? keywords : deriveKeywords(text);
    for (const keyword of fallbackKeywords) {
      const value = normalize(keyword);
      const key = value.toLowerCase();
      if (value.length < 4 || seen.has(key)) continue;
      seen.add(key);
      concepts.push(value);
      if (concepts.length >= max) break;
    }
  }
  return concepts;
}

// Recommend which grounded question shapes generation should emphasise, based
// on what the typed model actually contains (and the document type).
export function recommendTrainingShape(typed, documentType) {
  const shapes = [];
  if ((typed.procedures?.length ?? 0) >= 3 || documentType === "procedure") shapes.push("procedure");
  if ((typed.definitions?.length ?? 0) >= 2) shapes.push("definition");
  if ((typed.concepts?.length ?? 0) >= 2) shapes.push("concept");
  if ((typed.entities?.length ?? 0) >= 3) shapes.push("entity");
  if (shapes.length === 0) shapes.push("concept");
  return shapes;
}

// Build the full typed knowledge model for a source. `context` may supply the
// already-derived outline / procedure / keywords to avoid recomputation.
export function extractTypedKnowledge(text, context = {}) {
  const normalized = normalize(text);
  const definitions = extractDefinitions(normalized).filter((entry) => verifyGrounding([entry.term], normalized).grounded);
  const entities = extractEntities(normalized, definitions);
  const concepts = extractConcepts(normalized, { outline: context.outline, keywords: context.keywords });
  const procedures = (Array.isArray(context.procedure) ? context.procedure : []).slice(0, 12);
  const documentType = context.documentType ?? (procedures.length >= 3 ? "procedure" : "reference");
  const shapes = recommendTrainingShape({ definitions, entities, concepts, procedures }, documentType);
  return {
    concepts,
    definitions,
    procedures,
    entities,
    shapes,
    counts: { concepts: concepts.length, definitions: definitions.length, procedures: procedures.length, entities: entities.length },
  };
}

// OCR seam: describe whether image/scanned documents can be run through vision.
// Workers AI (env.AI) is the vision path when bound; otherwise callers flag
// "needs OCR" (unchanged behaviour). This keeps OCR a clean, testable seam.
export function describeOcr(env = {}) {
  const hasWorkersAi = Boolean(env?.AI);
  return {
    capable: hasWorkersAi,
    provider: hasWorkersAi ? "workers-ai-vision" : null,
    fallback: hasWorkersAi ? null : "needs-ocr",
  };
}
