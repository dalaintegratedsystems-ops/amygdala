import assert from "node:assert/strict";
import test from "node:test";
import {
  describeOcr,
  extractDefinitions,
  extractEntities,
  extractTypedKnowledge,
  recommendTrainingShape,
} from "../app/lib/knowledge.mjs";
import { extractKnowledge } from "../app/lib/ingest.mjs";

const STATUTE = `SAMPLE PROTECTION ACT
NO. 12 OF 2020

1. Definitions.—In this Act "learner" means a person receiving education; "school" means a place where education is provided to learners under this Act; "governing body" means a body contemplated in this Act.

2. Application of Act.—This Act applies to all public and independent schools in the Republic.

3. Language policy of public schools.—The governing body of a public school may determine the language policy of the school subject to the Constitution.`;

const PROCEDURE = `# Configure a workflow automation

1. Open Workflows from the primary navigation.
2. Select New automation.
3. Choose an approved trigger and configure its conditions.
4. Select Activate.`;

test("extractDefinitions parses statute term-means clauses, grounded", () => {
  const defs = extractDefinitions(STATUTE);
  const terms = defs.map((entry) => entry.term.toLowerCase());
  assert.ok(terms.includes("learner"));
  assert.ok(terms.includes("school"));
  assert.ok(terms.includes("governing body"));
  const learner = defs.find((entry) => entry.term.toLowerCase() === "learner");
  assert.match(learner.definition, /person receiving education/i);
});

test("extractEntities surfaces defined terms and proper-noun phrases", () => {
  const defs = extractDefinitions(STATUTE);
  const entities = extractEntities(STATUTE, defs);
  assert.ok(entities.length > 0);
});

test("extractTypedKnowledge builds a typed model with shapes for a reference doc", () => {
  const typed = extractTypedKnowledge(STATUTE, { procedure: [], documentType: "reference" });
  assert.ok(typed.definitions.length >= 3);
  assert.ok(typed.concepts.length >= 1);
  assert.ok(typed.shapes.includes("definition"));
  assert.equal(typed.counts.definitions, typed.definitions.length);
});

test("extractTypedKnowledge recommends the procedure shape for a procedure doc", () => {
  const result = extractKnowledge({ mimeType: "text/markdown", title: "Automation", text: PROCEDURE });
  const typed = extractTypedKnowledge(result.source.extractedText, { procedure: result.source.procedure, outline: result.outline, keywords: result.source.keywords, documentType: result.documentType });
  assert.ok(typed.procedures.length >= 3);
  assert.ok(typed.shapes.includes("procedure"));
});

test("recommendTrainingShape always yields at least a concept shape", () => {
  assert.deepEqual(recommendTrainingShape({}, "reference"), ["concept"]);
});

test("describeOcr reports the Workers AI seam only when bound", () => {
  assert.equal(describeOcr({}).capable, false);
  assert.equal(describeOcr({}).fallback, "needs-ocr");
  assert.equal(describeOcr({ AI: {} }).capable, true);
  assert.equal(describeOcr({ AI: {} }).provider, "workers-ai-vision");
});
