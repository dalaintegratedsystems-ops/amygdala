import assert from "node:assert/strict";
import test from "node:test";
import { actionLink, signActionToken, verifyActionToken } from "../app/lib/tokens.mjs";

const SECRET = "test-action-secret";

test("invite tokens sign and verify with the expected purpose", async () => {
  const token = await signActionToken({ purpose: "invite", sub: "usr-1", email: "ada@example.com", org: "org-a" }, SECRET);
  const result = await verifyActionToken(token, SECRET, { purpose: "invite" });
  assert.equal(result.valid, true);
  assert.equal(result.payload.sub, "usr-1");
  assert.equal(result.payload.email, "ada@example.com");
});

test("reset tokens reject a wrong purpose, bad signature, or expiry", async () => {
  const token = await signActionToken({ purpose: "reset", sub: "usr-1" }, SECRET, { ttlSeconds: 60 });
  assert.equal((await verifyActionToken(token, SECRET, { purpose: "invite" })).reason, "wrong-purpose");
  assert.equal((await verifyActionToken(token, "other", { purpose: "reset" })).reason, "bad-signature");
  const expired = await signActionToken({ purpose: "reset", sub: "usr-1" }, SECRET, { ttlSeconds: -1 });
  assert.equal((await verifyActionToken(expired, SECRET, { purpose: "reset" })).reason, "expired");
});

test("actionLink surfaces the token on a path", () => {
  assert.equal(actionLink("https://amygdalalishay.com", "/signin?invite=1", "abc.def"), "https://amygdalalishay.com/signin?invite=1&token=abc.def");
});
