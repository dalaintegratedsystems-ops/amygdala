import assert from "node:assert/strict";
import test from "node:test";
import { credentialValidity, decorateCredential } from "../app/lib/credentials.mjs";

test("credential validity is derived from issuedAt and defaults to 365 days", () => {
  const issuedAt = "2026-01-01T00:00:00.000Z";
  const valid = credentialValidity({ issuedAt }, { now: Date.parse("2026-06-01T00:00:00.000Z") });
  assert.equal(valid.status, "valid");
  assert.equal(valid.expiresAt.slice(0, 10), "2027-01-01");
  const expired = credentialValidity({ issuedAt }, { now: Date.parse("2027-02-01T00:00:00.000Z") });
  assert.equal(expired.status, "expired");
  const due = credentialValidity({ issuedAt }, { now: Date.parse("2026-12-15T00:00:00.000Z") });
  assert.equal(due.status, "recertify-due");
});

test("decorateCredential adds a verifiable stamp", async () => {
  const cred = { organisationId: "org-a", userId: "u1", courseId: "c1", issuedAt: "2026-01-01T00:00:00.000Z", readiness: 88 };
  const decorated = await decorateCredential(cred, "test-secret", Date.parse("2026-06-01T00:00:00.000Z"));
  assert.equal(decorated.verify.length, 32);
  assert.equal(decorated.status, "valid");
});
