import assert from "node:assert/strict";
import test from "node:test";
import { calculateReadiness } from "../app/lib/domain.mjs";
import {
  analyzeDocumentationGaps,
  calculateReadinessWithModel,
  competencyModels,
  defaultCompetencyModel,
} from "../app/lib/analytics.mjs";
import { aiActivity } from "./fixtures/analytics.mjs";

test("default competency model matches the fixed 30/40/30 formula", () => {
  const scores = { lessons: 80, simulation: 90, assessment: 70 };
  assert.equal(calculateReadinessWithModel(scores), calculateReadiness(scores));
  assert.equal(calculateReadinessWithModel(scores), 81);
});

test("alternative competency models reweight transparently", () => {
  const practiceFirst = competencyModels.find((model) => model.id === "practice-first");
  const value = calculateReadinessWithModel({ lessons: 80, simulation: 90, assessment: 70 }, practiceFirst);
  assert.equal(value, Math.round(80 * 0.2 + 90 * 0.5 + 70 * 0.3));
  assert.equal(defaultCompetencyModel.weights.simulation, 0.4);
});

test("documentation gaps rank repeated non-verified topics", () => {
  const gaps = analyzeDocumentationGaps(aiActivity);
  assert.ok(gaps.length > 0);
  assert.equal(gaps.every((gap) => gap.status !== "Verified"), true);
  // Bulk project archiving is asked twice and not covered -> top-ranked.
  assert.equal(gaps[0].topic, "Bulk project archiving");
  assert.equal(gaps[0].status, "Not covered");
  assert.match(gaps[0].recommendation, /Create an approved source/);
});

test("documentation gaps default to empty with no activity", () => {
  assert.deepEqual(analyzeDocumentationGaps(), []);
  assert.deepEqual(analyzeDocumentationGaps([]), []);
});
