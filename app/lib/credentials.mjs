// Readiness credentials: expiry + recertification + a small verifiable stamp.
// Expiry is derived from issuedAt (default 365 days) so the existing
// `credentials` table does not need a migration.

export const CREDENTIAL_TTL_DAYS = 365;
export const RECERTIFY_WARNING_DAYS = 30;

export function credentialValidity(cred, { now = Date.now(), ttlDays = CREDENTIAL_TTL_DAYS } = {}) {
  const issued = Date.parse(cred?.issuedAt) || now;
  const days = Number(cred?.recertifyAfterDays ?? cred?.breakdown?.recertifyAfterDays ?? ttlDays) || ttlDays;
  const expiresAt = cred?.expiresAt ?? new Date(issued + days * 86_400_000).toISOString();
  const remainingMs = Date.parse(expiresAt) - now;
  const expired = remainingMs < 0;
  const dueSoon = !expired && remainingMs <= RECERTIFY_WARNING_DAYS * 86_400_000;
  const status = expired ? "expired" : dueSoon ? "recertify-due" : "valid";
  return { expiresAt, expired, dueSoon, status, recertifyAfterDays: days };
}

function bytesToHex(bytes) {
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function credentialStamp(cred, secret) {
  const payload = [cred.organisationId, cred.userId, cred.courseId, cred.issuedAt, String(cred.readiness)].join("|");
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret || "amygdala-credential"), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return bytesToHex(new Uint8Array(signature).slice(0, 16));
}

export async function decorateCredential(cred, secret, now = Date.now()) {
  const validity = credentialValidity(cred, { now });
  const stamp = await credentialStamp(cred, secret);
  return { ...cred, ...validity, verify: stamp };
}
