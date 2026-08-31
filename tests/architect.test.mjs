// Offline tests for the AI course-architect logic (deterministic core).

import assert from "node:assert/strict";
import test from "node:test";
import { extractKnowledge } from "../app/lib/ingest.mjs";
import { generateCourseFromSource } from "../app/lib/authoring.mjs";
import { copilotFallback, deriveEditorHints, proposeBlueprint, quizFromOutline } from "../app/lib/architect.mjs";

const STATUTE = `SAMPLE PROTECTION ACT
NO. 12 OF 2020

1. Definitions.—In this Act "learner" means a person receiving education and "school" means a place where education is provided to learners under this Act on a regular basis for the benefit of the community.

2. Application of Act.—This Act applies to all public and independent schools in the Republic and binds every organ of state responsible for the administration of school education in every province.

3. Compulsory attendance.—Every parent must ensure that a learner attends school from the year the learner turns seven until the year the learner turns fifteen, unless exempted under this Act.

4. Admission to public schools.—A public school must admit learners without unfairly discriminating, and the admission policy is determined by the governing body in accordance with this Act.`;

const PROCEDURE = `# Configure a workflow automation

Automations run an approved action when a trigger event happens.

1. Open Workflows from the primary navigation.
2. Select New automation.
3. Choose an approved trigger and configure its conditions.
4. Select Activate.`;

function approvedSource(text, meta) {
  const result = extractKnowledge({ mimeType: "text/plain", text, ...meta });
  assert.equal(result.ok, true);
  return { ...result.source, id: "src-test", status: "Published", approvalStatus: "Approved" };
}

test("proposeBlueprint returns modules with objectives, durations, difficulty and prerequisites", () => {
  const source = approvedSource(STATUTE, { title: "Sample Protection Act No. 12 of 2020" });
  const blueprint = proposeBlueprint(source);
  assert.equal(blueprint.ok, true);
  assert.equal(blueprint.documentType, "reference");
  assert.ok(blueprint.modules.length >= 3);
  for (const mod of blueprint.modules) {
    assert.ok(mod.title && mod.objective && mod.rationale);
    assert.ok(Number.isFinite(mod.durationMinutes));
    assert.ok(["Introductory", "Intermediate", "Advanced"].includes(mod.difficulty));
    assert.ok(Array.isArray(mod.prerequisiteIds));
  }
  // Prerequisite ordering is chained (each after the first depends on a prior).
  assert.equal(blueprint.modules[0].prerequisiteIds.length, 0);
  assert.ok(blueprint.modules[1].prerequisiteIds.length >= 1);
});

test("proposeBlueprint adapts to a procedure with a learn/practise/validate shape", () => {
  const source = approvedSource(PROCEDURE, { title: "Configure a workflow automation", module: "Workflow automation" });
  const blueprint = proposeBlueprint(source);
  assert.equal(blueprint.documentType, "procedure");
  assert.equal(blueprint.modules.length, 3);
  assert.equal(blueprint.modules[0].id, "bp-learn");
});

test("deriveEditorHints flags a thin knowledge check and dense lessons", () => {
  const source = approvedSource(STATUTE, { title: "Sample Protection Act No. 12 of 2020" });
  const course = generateCourseFromSource(source);
  // Force a dense lesson to trigger the split hint.
  course.lessons[0].content = "x".repeat(1200);
  course.assessment.questions = course.assessment.questions.slice(0, 1);
  const hints = deriveEditorHints(course, source);
  const types = new Set(hints.map((hint) => hint.type));
  assert.ok(types.has("dense-section"), "expected a dense-section hint");
  assert.ok(types.has("add-knowledge-check"), "expected an add-knowledge-check hint");
  for (const hint of hints) assert.ok(hint.apply && hint.apply.action, "hint needs a one-click apply descriptor");
});

test("copilot make-concise stays grounded and cites spans", () => {
  const source = approvedSource(STATUTE, { title: "Sample Protection Act No. 12 of 2020" });
  const passage = source.explanation;
  const result = copilotFallback({ action: "make-concise", text: passage, source });
  assert.equal(result.ok, true);
  assert.ok(result.output.length > 0 && result.output.length <= passage.length + 1);
  assert.equal(result.citations[0].sourceId, source.id);
});

test("copilot generate-questions produces grounded, sibling-distractor quizzes", () => {
  const source = approvedSource(STATUTE, { title: "Sample Protection Act No. 12 of 2020" });
  const quiz = quizFromOutline(source, { count: 3 });
  assert.ok(quiz.length >= 2);
  const subjects = new Set(quiz.map((q) => q.options[q.correct]));
  for (const question of quiz) {
    for (const option of question.options.filter((_, i) => i !== question.correct)) {
      assert.notEqual(option, question.options[question.correct]);
    }
    assert.ok(subjects.size >= 2);
  }
});

test("copilot rewrite-nontechnical removes jargon deterministically", () => {
  const source = approvedSource(STATUTE, { title: "Sample Protection Act No. 12 of 2020" });
  const result = copilotFallback({ action: "rewrite-nontechnical", text: "Provisioning must commence pursuant to the RBAC policy.", source });
  assert.equal(/RBAC|provision|commence|pursuant/i.test(result.output), false);
});
