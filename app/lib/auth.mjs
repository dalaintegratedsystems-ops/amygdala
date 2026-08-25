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

// ---- user store ------------------------------------------------------
// Demo users with PBKDF2 credentials (no plaintext at rest). In production
// this is backed by D1 / your IdP. Demo password (all accounts):
//   Amygdala-Demo-2026
export const users = [
  { userId: "usr-vera", email: "vera@nexusflow.example", displayName: "Vera Ndlovu", organisationId: "org-nexus", role: "Vendor Administrator", credential: { salt: "acc0baff7da15c22c367aae25bedf661", iterations: PBKDF2_ITERATIONS, hash: "b5cfa670ef3fe6fa2a0d2324bf157991608086efe4dfae4d46850f7d318e3921" } },
  { userId: "usr-theo", email: "theo@nexusflow.example", displayName: "Theo Adeyemi", organisationId: "org-nexus", role: "Training Manager", credential: { salt: "01e0e8d3250e62a159b3e4e514789e5f", iterations: PBKDF2_ITERATIONS, hash: "616687bab2e87886a17256e7fd13e5e93581493bc4ed42fcda22041d3f5dd767" } },
  { userId: "usr-aisha", email: "aisha@aurora.example", displayName: "Aisha Naidoo", organisationId: "org-aurora", role: "Customer Learner", credential: { salt: "0d11a0825e4fb7e6aaea2bbc10390db2", iterations: PBKDF2_ITERATIONS, hash: "4c092c4a9ab790b6731ba5bc5720c134bfe37ba112711499059298cc2fda2485" } },
  // Owner admin login (Vendor Administrator). Only the salted PBKDF2 hash is
  // stored here; rotate the password after first sign-in.
  { userId: "usr-admin", email: "admin@amygdalalishay.com", displayName: "Site Administrator", organisationId: "org-nexus", role: "Vendor Administrator", credential: { salt: "70546e0164b462d9c8c2489e2764e338", iterations: PBKDF2_ITERATIONS, hash: "9b112b51bc627d93746c2c23248c2146557f067d7b6843c814589dc87c5afd27" } },
];

export function findUserByEmail(email) {
  const normalised = String(email ?? "").trim().toLowerCase();
  return users.find((user) => user.email.toLowerCase() === normalised) ?? null;
}

export async function authenticate(email, password) {
  const user = findUserByEmail(email);
  // Always run a hash to keep timing uniform whether or not the user exists.
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
