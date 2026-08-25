import assert from "node:assert/strict";
import test from "node:test";
import { calculateReadiness } from "../app/lib/domain.mjs";
import {
  analyzeDocumentationGaps,
  buildScormDataModel,
  buildScormManifest,
  buildXapiStatements,
  calculateReadinessWithModel,
  competencyModels,
  defaultCompetencyModel,
  listIntegrationConnectors,
} from "../app/lib/analytics.mjs";

const learner = { learner: "Aisha Naidoo", organisation: "Aurora Creative", role: "Project Manager", lessons: 82, simulation: 92, assessment: 100 };

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
  const gaps = analyzeDocumentationGaps();
  assert.ok(gaps.length > 0);
  assert.equal(gaps.every((gap) => gap.status !== "Verified"), true);
  // Bulk project archiving is asked twice and not covered -> top-ranked.
  assert.equal(gaps[0].topic, "Bulk project archiving");
  assert.equal(gaps[0].status, "Not covered");
  assert.match(gaps[0].recommendation, /Create an approved source/);
});

test("xAPI statements follow the actor/verb/object shape", () => {
  const statements = buildXapiStatements(learner);
  assert.equal(statements.length, 4);
  for (const statement of statements) {
    assert.ok(statement.actor.name);
    assert.match(statement.verb.id, /^http/);
    assert.ok(statement.object.id);
  }
  const achieved = statements.find((statement) => statement.verb.id.endsWith("achieved"));
  assert.equal(achieved.result.score.raw, calculateReadiness(learner));
});

test("SCORM manifest and data model are well-formed", () => {
  const manifest = buildScormManifest({ id: "prog-nexus", title: "NexusFlow Onboarding" });
  assert.match(manifest, /<manifest /);
  assert.match(manifest, /schemaversion>1\.2/);
  const data = buildScormDataModel(learner);
  assert.equal(data["cmi.core.lesson_status"], "passed");
  assert.equal(data["cmi.core.score.raw"], calculateReadiness(learner));
});

test("integration connectors include xAPI, SCORM and enterprise LMS", () => {
  const ids = listIntegrationConnectors().map((connector) => connector.id);
  assert.ok(ids.includes("xapi-lrs"));
  assert.ok(ids.includes("scorm"));
  assert.ok(ids.includes("workday"));
});
