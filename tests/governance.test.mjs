import assert from "node:assert/strict";
import test from "node:test";
import {
  detectSupersededSources,
  issueCredential,
  planContentReverification,
  runGroundingEval,
  signPayload,
  verifyCredential,
  verifySignature,
} from "../app/lib/governance.mjs";

test("prototype signing verifies and detects tampering", () => {
  const payload = { a: 1, b: "two" };
  const signature = signPayload(payload);
  assert.equal(verifySignature(payload, signature), true);
  assert.equal(verifySignature({ a: 1, b: "three" }, signature), false);
  // Deterministic and key order independent.
  assert.equal(signPayload({ b: "two", a: 1 }), signature);
});

test("issued credential verifies and carries expiry + recertification", () => {
  const credential = issueCredential({ learner: "Aisha Naidoo", readiness: 91 });
  assert.ok(credential.type.includes("VerifiableCredential"));
  assert.ok(credential.expirationDate > credential.issuanceDate);
  assert.ok(credential.recertifyBy);
  const result = verifyCredential(credential);
  assert.equal(result.valid, true);
  assert.equal(result.reason, "verified");
});

test("tampered credential fails verification", () => {
  const credential = issueCredential({ learner: "Aisha Naidoo", readiness: 91 });
  credential.credentialSubject.readiness = 100;
  const result = verifyCredential(credential);
  assert.equal(result.valid, false);
  assert.equal(result.reason, "signature-mismatch");
});

test("credential expiry is enforced against a clock", () => {
  const credential = issueCredential({ readiness: 91 }, { issuedAt: "2020-01-01T00:00:00.000Z", validityDays: 30 });
  const result = verifyCredential(credential, { now: "2026-01-01T00:00:00.000Z" });
  assert.equal(result.valid, false);
  assert.equal(result.expired, true);
});

test("detects superseded sources (archived + newer version)", () => {
  const superseded = detectSupersededSources();
  const legacy = superseded.find((item) => item.sourceId === "src-legacy");
  assert.ok(legacy, "legacy source should be flagged");
  assert.equal(legacy.reason, "archived");
  assert.equal(legacy.replacedBy, "src-projects");
});

test("re-verification plan lists affected downstream training", () => {
  const plan = planContentReverification();
  const legacyPlan = plan.find((item) => item.sourceId === "src-legacy");
  assert.ok(legacyPlan);
  assert.ok(Array.isArray(legacyPlan.affected));
});

test("grounding eval passes every expectation", () => {
  const report = runGroundingEval();
  assert.equal(report.allPassed, true, JSON.stringify(report.results.filter((result) => !result.passed)));
  assert.equal(report.metrics.injectionBlockRate, 1);
  assert.equal(report.metrics.refusalAccuracy, 1);
  assert.equal(report.metrics.citationCoverage, 1);
});
