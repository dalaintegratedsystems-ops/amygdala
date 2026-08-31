// Ship-ready, right-sized authentication & authorization.
//
// Security model (what makes this safe without over-engineering):
//  - Passwords are never stored in plaintext: PBKDF2-SHA-256 with a
//    per-user salt and 100k iterations (WebCrypto, works in Workers & Node).
//  - Sessions are stateless, signed tokens (HMAC-SHA-256) with an expiry,
//    delivered as an HttpOnly + SameSite=Lax cookie (Secure in production).
//  - Authorization is derived SERVER-SIDE from the verified session, then
//    fed into the existing capability + tenant-isolation checks. Clients can
//    no longer self-declare role or tenant via headers.
//
// Production notes: federate real auth via an IdP/SSO broker (OIDC/SAML +
// SCIM) and load users from D1; set AUTH_SECRET via Workers Secrets. The
// verify/authorize contract below stays identical when you do.

import { authorize } from "./security.mjs";

export const SESSION_COOKIE = "amygdala_session";
const PBKDF2_ITERATIONS = 100000;
const SESSION_TTL_SECONDS = 12 * 60 * 60;
const DEV_SESSION_SECRET = "amygdala-dev-session-secret-change-me";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

// ---- encoding helpers ------------------------------------------------

function bytesToHex(bytes) {
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(hex) {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i += 1) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function randomHex(byteLength) {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return bytesToHex(bytes);
}

function bytesToBase64url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64urlToString(value) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  return atob(padded);
}

function jsonToBase64url(object) {
  return bytesToBase64url(encoder.encode(JSON.stringify(object)));
}

// Constant-time string comparison to avoid signature timing leaks.
function timingSafeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i += 1) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
}

// ---- password hashing (PBKDF2-SHA-256) -------------------------------

async function pbkdf2(password, saltHex, iterations) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: hexToBytes(saltHex), iterations }, key, 256);
  return bytesToHex(new Uint8Array(bits));
}

export async function hashPassword(password, saltHex = randomHex(16), iterations = PBKDF2_ITERATIONS) {
  return { salt: saltHex, iterations, hash: await pbkdf2(password, saltHex, iterations) };
}

export async function verifyPassword(password, credential) {
  if (!credential || !credential.salt || !credential.hash) return false;
  const candidate = await pbkdf2(password, credential.salt, credential.iterations ?? PBKDF2_ITERATIONS);
  return timingSafeEqual(candidate, credential.hash);
}

// ---- signed sessions (HMAC-SHA-256) ----------------------------------

async function hmacSign(secret, data) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(data));
  return bytesToBase64url(new Uint8Array(signature));
}

export async function createSession(principal, secret, { ttlSeconds = SESSION_TTL_SECONDS, now = Date.now() } = {}) {
  const payload = {
    sub: principal.userId,
    email: principal.email,
    name: principal.displayName,
    role: principal.role,
    org: principal.organisationId,
    iat: now,
    exp: now + ttlSeconds * 1000,
  };
  const body = jsonToBase64url(payload);
  const signature = await hmacSign(secret, body);
  return `${body}.${signature}`;
}

export async function verifySession(token, secret, { now = Date.now() } = {}) {
  if (typeof token !== "string" || !token.includes(".")) return { valid: false, reason: "malformed" };
  const [body, signature] = token.split(".");
  const expected = await hmacSign(secret, body);
  if (!timingSafeEqual(signature, expected)) return { valid: false, reason: "bad-signature" };
  let payload;
  try {
    payload = JSON.parse(decoder.decode(Uint8Array.from(base64urlToString(body), (c) => c.charCodeAt(0))));
  } catch {
    return { valid: false, reason: "malformed" };
  }
  if (payload.exp && now > payload.exp) return { valid: false, reason: "expired" };
  return {
    valid: true,
    principal: { userId: payload.sub, email: payload.email, displayName: payload.name, role: payload.role, organisationId: payload.org },
    expiresAt: payload.exp,
  };
}

// ---- authentication --------------------------------------------------
// Users live in the D1 `users` table (via the data store) with PBKDF2
// credentials — no plaintext and no fictional demo accounts shipped in code.
// The route loads the user record and passes it here; `authenticate` verifies
// the password in constant time whether or not the user exists.
export async function authenticate(user, password) {
  const credential = user?.credential ?? { salt: "0".repeat(32), iterations: PBKDF2_ITERATIONS, hash: "" };
  const ok = await verifyPassword(String(password ?? ""), credential);
  if (!user || !ok) return { ok: false, reason: "invalid-credentials" };
  return { ok: true, principal: { userId: user.userId, email: user.email, displayName: user.displayName, role: user.role, organisationId: user.organisationId } };
}

// ---- request helpers -------------------------------------------------

export function getSessionSecret(env = {}) {
  return env.AUTH_SECRET && String(env.AUTH_SECRET).length > 0 ? String(env.AUTH_SECRET) : DEV_SESSION_SECRET;
}

export function readCookie(cookieHeader, name) {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=");
  }
  return null;
}

export function buildSessionCookie(token, { secure = true, maxAgeSeconds = SESSION_TTL_SECONDS } = {}) {
  const attributes = [`${SESSION_COOKIE}=${token}`, "Path=/", "HttpOnly", "SameSite=Lax", `Max-Age=${maxAgeSeconds}`];
  if (secure) attributes.push("Secure");
  return attributes.join("; ");
}

export function clearSessionCookie({ secure = true } = {}) {
  const attributes = [`${SESSION_COOKIE}=`, "Path=/", "HttpOnly", "SameSite=Lax", "Max-Age=0"];
  if (secure) attributes.push("Secure");
  return attributes.join("; ");
}

// Resolve the verified principal for a request from its session cookie.
export async function resolveRequestIdentity(request, env = {}) {
  const token = readCookie(request.headers.get("cookie"), SESSION_COOKIE);
  if (!token) return null;
  const result = await verifySession(token, getSessionSecret(env));
  return result.valid ? result.principal : null;
}

// Server-side authorization for a request: verified identity -> capability
// + tenant-isolation decision. Never trusts client-declared role/tenant.
export async function authorizeRequest(request, action, env = {}, resourceOrganisationId) {
  const principal = await resolveRequestIdentity(request, env);
  if (!principal) return { allowed: false, reason: "no-session", principal: null };
  const decision = authorize({ role: principal.role, action, actorOrganisationId: principal.organisationId, resourceOrganisationId });
  return { ...decision, principal };
}
