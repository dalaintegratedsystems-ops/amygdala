import assert from "node:assert/strict";
import test from "node:test";
import { assessCourseCoverage, groundingScore } from "../app/lib/coverage.mjs";
import { extractKnowledge } from "../app/lib/ingest.mjs";
import { generateCourseFromSource } from "../app/lib/authoring.mjs";

const STATUTE = `SAMPLE PROTECTION ACT
NO. 12 OF 2020

1. Definitions.—In this Act "learner" means a person receiving education and "school" means a place where education is provided to learners on a regular basis under this Act for the benefit of the community.

2. Application of Act.—This Act applies to all public and independent schools in the Republic and binds every organ of state responsible for the administration of school education in every province.

3. Compulsory attendance.—Every parent must ensure that a learner attends a school from the first day of the year in which the learner turns seven until the last day of the year in which the learner turns fifteen.

4. Admission to public schools.—A public school must admit learners and serve their educational requirements without unfairly discriminating in any way against any applicant learner.

5. Language policy of public schools.—The governing body of a public school may determine the language policy of the school subject to the Constitution, this Act and any applicable provincial law.`;

function approvedSource() {
  const result = extractKnowledge({ mimeType: "text/plain", title: "Sample Protection Act No. 12 of 2020", text: STATUTE });
  return { ...result.source, id: "src-cov", status: "Published", approvalStatus: "Approved" };
}

test("groundingScore rewards source-derived sentences and flags foreign ones", () => {
  const vocab = new Set(["learner", "school", "education", "governing", "policy", "language"]);
  assert.ok(groundingScore("The governing body sets the language policy of the school.", vocab) >= 0.5);
  assert.ok(groundingScore("Configure the billing dashboard integration webhook payload.", vocab) < 0.5);
});

test("assessCourseCoverage reports coverage, claims and per-item confidence", () => {
  const source = approvedSource();
  const course = generateCourseFromSource(source);
  const report = assessCourseCoverage(source, course);
  assert.ok(report.sectionsTotal >= 3);
  assert.ok(report.coveragePercent >= 0 && report.coveragePercent <= 100);
  assert.ok(report.sectionsCovered >= 1, "the course should cover at least one source section");
  assert.equal(typeof report.claims.groundedRatio, "number");
  assert.ok(report.confidence.lessons.length === course.lessons.length);
  assert.ok(report.confidence.questions.length === course.assessment.questions.length);
  assert.ok(report.confidence.average >= 0 && report.confidence.average <= 1);
});

test("assessCourseCoverage flags an injected unsupported claim", () => {
  const source = approvedSource();
  const course = generateCourseFromSource(source);
  course.lessons[0].content = "Configure the billing dashboard webhook and provision the kubernetes cluster autoscaler.";
  const report = assessCourseCoverage(source, course);
  assert.ok(report.claims.ungrounded.length >= 1, "expected the foreign claim to be flagged");
});
