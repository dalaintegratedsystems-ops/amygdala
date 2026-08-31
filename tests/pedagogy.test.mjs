import assert from "node:assert/strict";
import test from "node:test";
import {
  annotateQuestion,
  bloomObjective,
  definitionQuestions,
  enrichCoursePedagogy,
  trueFalseQuestions,
} from "../app/lib/pedagogy.mjs";
import { extractTypedKnowledge } from "../app/lib/knowledge.mjs";
import { extractKnowledge } from "../app/lib/ingest.mjs";
import { generateCourseFromSource } from "../app/lib/authoring.mjs";

const STATUTE = `SAMPLE PROTECTION ACT
NO. 12 OF 2020

1. Definitions.—In this Act "learner" means a person receiving education; "school" means a place where education is provided to learners; "governing body" means a body governing a public school.

2. Application of Act.—This Act applies to all public and independent schools in the Republic and binds every organ of state responsible for the administration of school education.

3. Language policy of public schools.—The governing body of a public school may determine the language policy of the school subject to the Constitution.

4. Admission to public schools.—A public school must admit learners without unfairly discriminating in any way.`;

function approvedSource() {
  const result = extractKnowledge({ mimeType: "text/plain", title: "Sample Protection Act No. 12 of 2020", text: STATUTE });
  const typed = extractTypedKnowledge(result.source.extractedText, { procedure: result.source.procedure, outline: result.outline, keywords: result.source.keywords, documentType: result.documentType });
  const source = { ...result.source, id: "src-ped", status: "Published", approvalStatus: "Approved" };
  return { source, typed };
}

test("bloomObjective tags a difficulty with a Bloom level and verb", () => {
  const objective = bloomObjective("Language policy of public schools", "Advanced");
  assert.equal(objective.bloom, "Apply");
  assert.ok(objective.text.startsWith("Apply"));
});

test("definitionQuestions are grounded with sibling-definition distractors", () => {
  const { source, typed } = approvedSource();
  const questions = definitionQuestions(source, typed, { count: 3 });
  assert.ok(questions.length >= 2);
  for (const question of questions) {
    assert.equal(question.type, "definition");
    assert.equal(question.correct, 0);
    assert.ok(question.rationale.length > 0);
    assert.equal(question.optionFeedback.length, question.options.length);
    assert.ok(["Introductory", "Intermediate", "Advanced"].includes(question.difficulty));
  }
});

test("trueFalseQuestions alternate truth value and stay grounded", () => {
  const { source, typed } = approvedSource();
  const questions = trueFalseQuestions(source, typed, { count: 2 });
  assert.ok(questions.length >= 1);
  assert.deepEqual(questions[0].options, ["True", "False"]);
  assert.ok(questions.every((question) => question.rationale && question.bloom));
});

test("annotateQuestion adds rationale, feedback, difficulty and bloom", () => {
  const base = { id: "q1", question: "Which?", options: ["A", "B"], correct: 0, citation: { sourceId: "s", title: "T", version: "1", section: "S" } };
  const annotated = annotateQuestion(base, { id: "s", title: "T", version: "1", section: "S" }, 0);
  assert.ok(annotated.rationale.includes("A"));
  assert.equal(annotated.optionFeedback.length, 2);
  assert.equal(annotated.bloom, "Remember");
});

test("enrichCoursePedagogy adds objectives, varied question types and stays Draft", () => {
  const { source, typed } = approvedSource();
  const course = generateCourseFromSource(source);
  const enriched = enrichCoursePedagogy(course, source, typed);
  // Programme still Draft/Pending — enrichment never publishes.
  assert.equal(enriched.programme.status, "Draft");
  assert.equal(enriched.programme.approvalStatus, "Pending");
  // Every module carries a Bloom-tagged objective.
  for (const courseModule of enriched.modules) {
    assert.ok(courseModule.objective && courseModule.bloom && courseModule.difficulty);
  }
  // The assessment now mixes question types and every item has a rationale.
  const types = new Set(enriched.assessment.questions.map((question) => question.type));
  assert.ok(types.size >= 2, `expected varied question types, got ${[...types].join(",")}`);
  for (const question of enriched.assessment.questions) {
    assert.ok(question.rationale && question.difficulty && question.bloom);
  }
  assert.ok(enriched.pedagogy.objectives.length >= 1);
  assert.ok(enriched.pedagogy.questionTypes.length >= 2);
});
