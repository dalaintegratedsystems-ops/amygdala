import assert from "node:assert/strict";
import test from "node:test";
import { generateTotpSecret, totpCode, totpUri, verifyTotp } from "../app/lib/totp.mjs";

test("TOTP secret generates and a live code verifies", async () => {
  const secret = generateTotpSecret();
  assert.match(secret, /^[A-Z2-7]+$/);
  const now = Date.parse("2026-08-31T12:00:00.000Z");
  const code = await totpCode(secret, { now });
  assert.match(code, /^\d{6}$/);
  assert.equal(await verifyTotp(secret, code, { now }), true);
  assert.equal(await verifyTotp(secret, "000000", { now }), false);
});

test("TOTP accepts an adjacent time-step and rejects a far-off one", async () => {
  const secret = generateTotpSecret();
  const now = Date.parse("2026-08-31T12:00:00.000Z");
  const code = await totpCode(secret, { now });
  assert.equal(await verifyTotp(secret, code, { now: now + 25_000 }), true);
  assert.equal(await verifyTotp(secret, code, { now: now + 120_000 }), false);
});

test("otpauth URI includes the secret and issuer", () => {
  assert.match(totpUri({ secret: "MFRGGZDF", account: "ada@example.com" }), /otpauth:\/\/totp\/Amygdala/);
  assert.match(totpUri({ secret: "MFRGGZDF", account: "ada@example.com" }), /secret=MFRGGZDF/);
});
