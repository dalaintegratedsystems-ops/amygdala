import assert from "node:assert/strict";
import test from "node:test";
import { sources } from "../app/lib/domain.mjs";
import { approveCourse, generateCourseFromSource, summariseGeneratedCourse } from "../app/lib/authoring.mjs";

const projectSource = sources.find((source) => source.id === "src-projects");
const draftSource = sources.find((source) => source.id === "src-release");

test("generates a grounded draft course from an approved source", () => {
  const course = generateCourseFromSource(projectSource);
  assert.equal(course.ok, true);
  assert.equal(course.programme.status, "Draft");
  assert.equal(course.programme.approvalStatus, "Pending");
  assert.equal(course.provenance.grounded, true);
  assert.equal(course.provenance.sourceId, "src-projects");
});

test("every generated artefact cites the source version and section", () => {
  const course = generateCourseFromSource(projectSource);
  assert.equal(course.citation.sourceId, "src-projects");
  for (const lesson of course.lessons) {
    assert.equal(lesson.citation.sourceId, "src-projects");
    assert.equal(lesson.citation.version, projectSource.version);
  }
  for (const question of course.assessment.questions) {
    assert.equal(question.citation.section, projectSource.section);
  }
});

test("assessment keeps the fixed 80% pass threshold", () => {
  const course = generateCourseFromSource(projectSource);
  assert.equal(course.assessment.passThreshold, 80);
  assert.ok(course.assessment.questions.length > 0);
});

test("simulation steps mirror the approved procedure order", () => {
  const course = generateCourseFromSource(projectSource);
  assert.deepEqual(course.simulation.steps.map((step) => step.label), projectSource.procedure);
});

test("generation is deterministic", () => {
  assert.deepEqual(generateCourseFromSource(projectSource), generateCourseFromSource(projectSource));
});

test("refuses to generate from an unapproved (draft) source", () => {
  const course = generateCourseFromSource(draftSource);
  assert.equal(course.ok, false);
  assert.equal(course.reason, "source-not-approved");
});

test("human approval publishes the whole course", () => {
  const published = approveCourse(generateCourseFromSource(projectSource));
  assert.equal(published.programme.status, "Published");
  assert.equal(published.programme.approvalStatus, "Approved");
  assert.ok(published.lessons.every((lesson) => lesson.status === "Published"));
});

test("summary reports artefact counts", () => {
  const summary = summariseGeneratedCourse(generateCourseFromSource(projectSource));
  assert.equal(summary.modules, 3);
  assert.ok(summary.lessons >= 2);
  assert.ok(summary.simulationSteps >= 1);
});
