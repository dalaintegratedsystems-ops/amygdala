// Signed action tokens (invite, password-reset, MFA challenge).
// Same HMAC-SHA-256 + expiry shape as sessions, isolated so auth.mjs stays
// store-free and its existing tests keep importing it as source.

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function bytesToBase64url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64urlToBytes(value) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

function timingSafeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i += 1) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
}

async function hmacSign(secret, data) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(data));
  return bytesToBase64url(new Uint8Array(signature));
}

export const INVITE_TTL_SECONDS = 7 * 24 * 60 * 60;
export const RESET_TTL_SECONDS = 2 * 60 * 60;
export const MFA_CHALLENGE_TTL_SECONDS = 5 * 60;

/**
 * @param {Record<string, unknown>} payload
 * @param {string} secret
 * @param {{ ttlSeconds?: number, now?: number }} [options]
 */
export async function signActionToken(payload, secret, { ttlSeconds = INVITE_TTL_SECONDS, now = Date.now() } = {}) {
  const body = {
    ...payload,
    iat: now,
    exp: now + ttlSeconds * 1000,
  };
  const encoded = bytesToBase64url(encoder.encode(JSON.stringify(body)));
  const signature = await hmacSign(secret, encoded);
  return `${encoded}.${signature}`;
}

/**
 * @param {string} token
 * @param {string} secret
 * @param {{ purpose?: string, now?: number }} [options]
 * @returns {Promise<{ valid: true, payload: Record<string, any> } | { valid: false, reason: string }>}
 */
export async function verifyActionToken(token, secret, { purpose, now = Date.now() } = {}) {
  if (typeof token !== "string" || !token.includes(".")) return { valid: false, reason: "malformed" };
  const [body, signature] = token.split(".");
  const expected = await hmacSign(secret, body);
  if (!timingSafeEqual(signature, expected)) return { valid: false, reason: "bad-signature" };
  let payload;
  try {
    payload = JSON.parse(decoder.decode(base64urlToBytes(body)));
  } catch {
    return { valid: false, reason: "malformed" };
  }
  if (purpose && payload.purpose !== purpose) return { valid: false, reason: "wrong-purpose" };
  if (payload.exp && now > payload.exp) return { valid: false, reason: "expired" };
  return { valid: true, payload };
}

export function actionLink(origin, path, token) {
  const base = String(origin ?? "").replace(/\/$/, "");
  return `${base}${path}${path.includes("?") ? "&" : "?"}token=${encodeURIComponent(token)}`;
}
