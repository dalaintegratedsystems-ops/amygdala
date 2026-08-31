// Offline regression tests for the four authoring-quality QA bugs:
//  1. empty-variable templating (blank title fragments)
//  2. generic / irrelevant assessment distractors + wrong stems
//  3. no large-document handling (silent truncation)
//  4. no junk-input gate (garbled/binary text -> "successful" draft)
//
// All deterministic, no network.

import assert from "node:assert/strict";
import test from "node:test";
import {
  assessInputQuality,
  chunkText,
  deriveDocumentType,
  extractKnowledge,
  outlineDocument,
} from "../app/lib/ingest.mjs";
import { generateCourseFromSource, summariseGeneratedCourse, topicLabel } from "../app/lib/authoring.mjs";

// A compact synthetic statute-style reference document (numbered legal
// sections, no Markdown headings, no procedural "actions").
const STATUTE = `SAMPLE PROTECTION ACT
NO. 12 OF 2020

CHAPTER 1
DEFINITIONS AND APPLICATION

1. Definitions.—In this Act, unless the context indicates otherwise, "learner" means a person receiving education, and "school" means a place where education is provided to learners on a regular basis under this Act.

2. Application of Act.—This Act applies to all public and independent schools in the Republic, and binds every organ of state that is responsible for the administration of school education across all provinces.

CHAPTER 2
ADMISSION AND ATTENDANCE

3. Compulsory attendance.—Every parent must ensure that a learner for whom the parent is responsible attends a school from the first school day of the year in which the learner reaches the age of seven years until the last school day of the year in which the learner reaches the age of fifteen years.

4. Admission to public schools.—A public school must admit learners and serve their educational requirements without unfairly discriminating in any way, and the admission policy must be determined by the governing body of the school in accordance with this Act.

5. Language policy of public schools.—The governing body of a public school may determine the language policy of the school subject to the Constitution, this Act and any applicable provincial law, and must promote multilingualism.`;

// A short procedural document (Markdown numbered steps).
const PROCEDURE = `# Configure a workflow automation

Automations run an approved action when a trigger event happens.

1. Open Workflows from the primary navigation.
2. Select New automation.
3. Choose an approved trigger and configure its conditions.
4. Choose an action and complete its required fields.
5. Review the automation summary.
6. Select Activate.`;

function ingestApproved(text, meta) {
  const result = extractKnowledge({ mimeType: "text/plain", text, ...meta });
  assert.equal(result.ok, true, `expected ingest ok for ${meta.title}`);
  return { ...result.source, id: `src-${topicLabel(result.source).toLowerCase().replace(/\W+/g, "-")}`, status: "Published", approvalStatus: "Approved" };
}

// ---- Bug 1: clean title templating (no blank fragments) --------------

test("titles never contain blank templated fragments", () => {
  const source = ingestApproved(STATUTE, { title: "Sample Protection Act No. 12 of 2020" });
  const course = generateCourseFromSource(source);
  const blob = JSON.stringify(course);
  for (const bad of ['": grounded', "Understand \u201c", "Understand \"", "Why  matters", "Practise: \"", '": ,', "Understand ,", "Prove  readiness"]) {
    assert.equal(blob.includes(bad), false, `found dangling fragment: ${JSON.stringify(bad)}`);
  }
  // No title is empty or ends with a dangling separator.
  const titles = [course.programme.title, ...course.modules.map((m) => m.title), ...course.lessons.map((l) => l.title), course.simulation.title];
  for (const title of titles) {
    assert.ok(title && title.trim().length > 0, "empty title");
    assert.equal(/[:\-–]\s*$/.test(title), false, `dangling separator in "${title}"`);
    assert.equal(/\b(Understand|Why|Practise|Prove)\s*$/.test(title.trim()), false, `blank variable in "${title}"`);
  }
});

test("topicLabel prefers a clean human label over codes / blanks", () => {
  assert.equal(topicLabel({ module: "", section: "", title: "Data Retention Policy" }), "Data Retention Policy");
  assert.equal(topicLabel({ module: "NO. 84 OF 1996", section: "SOUTH AFRICAN SCHOOLS ACT", title: "South African Schools Act No. 84 of 1996" }), "South African Schools Act No. 84 of 1996");
  assert.equal(topicLabel({ module: "Unassigned", section: "Awaiting review", title: "Onboarding Guide" }), "Onboarding Guide");
});

// ---- Bug 2: relevant, source-derived distractors + reframed stems -----

test("reference assessment uses sibling-section distractors, never SaaS boilerplate", () => {
  const source = ingestApproved(STATUTE, { title: "Sample Protection Act No. 12 of 2020" });
  const course = generateCourseFromSource(source);
  assert.equal(course.kind, "reference");
  assert.ok(course.assessment.questions.length >= 3);

  const subjects = new Set(outlineDocument(source.extractedText).map((entry) => entry.section.replace(/^\d{1,3}[A-Z]?\.\s+/, "")));
  const boilerplate = ["Delete the workspace", "Change the billing plan", "Export a report", "Archive the project"];
  for (const question of course.assessment.questions) {
    // Stems are comprehension questions, NOT "which action is approved?".
    assert.equal(/which action is approved/i.test(question.question), false);
    for (const option of boilerplate) assert.equal(question.options.includes(option), false);
    // Every distractor is a real sibling subject drawn from the document.
    const distractors = question.options.filter((_, i) => i !== question.correct);
    for (const distractor of distractors) {
      assert.ok(subjects.has(distractor), `distractor not from siblings: ${JSON.stringify(distractor)}`);
    }
  }
});

test("procedure assessment distractors come from other approved steps", () => {
  const source = ingestApproved(PROCEDURE, { title: "Configure a workflow automation", module: "Workflow automation" });
  const course = generateCourseFromSource(source);
  assert.equal(course.kind, "procedure");
  const steps = new Set(source.procedure);
  for (const question of course.assessment.questions) {
    const distractors = question.options.filter((_, i) => i !== question.correct);
    for (const distractor of distractors) {
      assert.ok(steps.has(distractor) || /^Something about /.test(distractor), `unexpected distractor: ${JSON.stringify(distractor)}`);
    }
  }
});

// ---- Bug 3: large-document handling (no silent truncation) -----------

test("a long document is chunked section-aware and covered across modules", () => {
  // Build a large multi-section reference doc (> 20k chars, many sections).
  const sections = [];
  for (let i = 1; i <= 30; i += 1) {
    sections.push(`${i}. Topic number ${i} obligations.—Every responsible party must observe the requirements described in this section, keep accurate records for topic number ${i}, and report annually to the regulator regarding compliance with topic number ${i} across all affected operations and departments within the organisation.`);
  }
  const bigDoc = `LARGE REFERENCE ACT\nNO. 99 OF 2024\n\n${sections.join("\n\n")}`;
  const result = extractKnowledge({ mimeType: "text/plain", title: "Large Reference Act", text: bigDoc });
  assert.equal(result.ok, true);
  // Coverage indicator is returned and reports the whole document.
  assert.ok(result.coverage.charsTotal > 5000);
  assert.equal(result.coverage.charsProcessed, result.coverage.charsTotal, "should not truncate a doc within the storage limit");
  assert.ok(result.summary.chunks > 8, `expected many chunks, got ${result.summary.chunks}`);
  assert.ok(result.outline.length >= 20, `expected a rich outline, got ${result.outline.length}`);

  const source = { ...result.source, id: "src-large", status: "Published", approvalStatus: "Approved" };
  const course = generateCourseFromSource(source);
  const summary = summariseGeneratedCourse(course);
  // Not truncated to the old fixed 3 modules / 8 steps: multi-section coverage.
  assert.ok(summary.modules >= 6, `expected multi-section modules, got ${summary.modules}`);
  assert.ok(summary.lessons >= 6, `expected multi-section lessons, got ${summary.lessons}`);
  assert.ok(course.coverage && course.coverage.sectionsTotal >= 20);
});

test("chunkText splits oversized sections so nothing is dropped", () => {
  const huge = `# One section\n\n${"word ".repeat(2000)}`;
  const chunks = chunkText(huge, { maxChars: 600 });
  assert.ok(chunks.length > 5);
  for (const chunk of chunks) assert.ok(chunk.content.length <= 700);
});

test("deriveDocumentType distinguishes procedures from reference material", () => {
  assert.equal(deriveDocumentType(PROCEDURE), "procedure");
  assert.equal(deriveDocumentType(STATUTE), "reference");
});

// ---- Bug 4: junk-input gate ------------------------------------------

test("garbled / binary text is refused, not turned into a course", () => {
  const junk = "%PDF-1.7\uFFFD\uFFFD 8f3a9b2c1d4e5f6a7b8c9d0e1f2a3b4c x9K#@!$%^&*()_+ 0101010101 qwbxzptkvjfg mnbvcxz zxcvbnmasdfghjkl ".repeat(30);
  const quality = assessInputQuality(junk);
  assert.equal(quality.ok, false);
  assert.equal(quality.reason, "low-signal");
  const result = extractKnowledge({ mimeType: "text/plain", title: "blob", text: junk });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "low-signal");
});

test("clean natural-language text passes the junk gate", () => {
  const quality = assessInputQuality(STATUTE);
  assert.equal(quality.ok, true);
  assert.ok(quality.score >= 0.7);
});
