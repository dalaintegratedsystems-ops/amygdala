import assert from "node:assert/strict";
import test from "node:test";
import {
  authenticate,
  authorizeRequest,
  buildSessionCookie,
  createSession,
  hashPassword,
  readCookie,
  resolveRequestIdentity,
  verifyPassword,
  verifySession,
} from "../app/lib/auth.mjs";

const SECRET = "test-secret";

function requestWithSession(token) {
  return new Request("https://app.local/api/x", { headers: { cookie: `amygdala_session=${token}` } });
}

test("passwords hash and verify, and reject wrong password", async () => {
  const credential = await hashPassword("Correct-Horse-1");
  assert.equal(credential.hash.length, 64);
  assert.equal(await verifyPassword("Correct-Horse-1", credential), true);
  assert.equal(await verifyPassword("wrong", credential), false);
});

test("authenticate verifies a stored user record and rejects bad input", async () => {
  const credential = await hashPassword("Amygdala-Demo-2026");
  const user = { userId: "usr-admin", email: "admin@amygdalalishay.com", displayName: "Site Administrator", role: "Vendor Administrator", organisationId: "org-primary", credential };
  const ok = await authenticate(user, "Amygdala-Demo-2026");
  assert.equal(ok.ok, true);
  assert.equal(ok.principal.role, "Vendor Administrator");
  assert.equal(ok.principal.organisationId, "org-primary");
  assert.equal((await authenticate(user, "nope")).ok, false);
  // A missing user record still runs a constant-time hash and fails closed.
  assert.equal((await authenticate(null, "x")).ok, false);
});

test("sessions sign, verify, and carry the principal", async () => {
  const token = await createSession({ userId: "usr-vera", email: "vera@nexusflow.example", displayName: "Vera", role: "Vendor Administrator", organisationId: "org-nexus" }, SECRET);
  const result = await verifySession(token, SECRET);
  assert.equal(result.valid, true);
  assert.equal(result.principal.role, "Vendor Administrator");
});

test("tampered or expired sessions are rejected", async () => {
  const token = await createSession({ userId: "u", role: "Customer Learner", organisationId: "org-aurora" }, SECRET);
  const [body] = token.split(".");
  assert.equal((await verifySession(`${body}.deadbeef`, SECRET)).valid, false);
  assert.equal((await verifySession(token, "other-secret")).reason, "bad-signature");
  const expired = await createSession({ userId: "u", role: "Customer Learner", organisationId: "org-aurora" }, SECRET, { ttlSeconds: -1 });
  assert.equal((await verifySession(expired, SECRET)).reason, "expired");
});

test("cookie parsing extracts the session value", () => {
  assert.equal(readCookie("a=1; amygdala_session=abc.def; b=2", "amygdala_session"), "abc.def");
  assert.equal(readCookie("", "amygdala_session"), null);
});

test("authorizeRequest derives role server-side from the cookie", async () => {
  const adminToken = await createSession({ userId: "usr-vera", role: "Vendor Administrator", organisationId: "org-nexus" }, "amygdala-dev-session-secret-change-me");
  const allowed = await authorizeRequest(requestWithSession(adminToken), "publish-source");
  assert.equal(allowed.allowed, true);
  assert.equal(allowed.principal.role, "Vendor Administrator");

  const learnerToken = await createSession({ userId: "usr-aisha", role: "Customer Learner", organisationId: "org-aurora" }, "amygdala-dev-session-secret-change-me");
  const denied = await authorizeRequest(requestWithSession(learnerToken), "publish-source");
  assert.equal(denied.allowed, false);
  assert.equal(denied.reason, "insufficient-role");
});

test("no cookie means no identity (fail closed)", async () => {
  const request = new Request("https://app.local/api/x");
  assert.equal(await resolveRequestIdentity(request), null);
  assert.equal((await authorizeRequest(request, "view-admin")).reason, "no-session");
});

test("session cookie is HttpOnly + SameSite and Secure when requested", () => {
  const cookie = buildSessionCookie("tok", { secure: true });
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Lax/);
  assert.match(cookie, /Secure/);
  assert.doesNotMatch(buildSessionCookie("tok", { secure: false }), /Secure/);
});
