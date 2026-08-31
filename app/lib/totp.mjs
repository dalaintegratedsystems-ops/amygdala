// RFC 6238 TOTP (SHA-1, 30s, 6 digits) using WebCrypto. No extra deps.

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function bytesToBase32(bytes) {
  let bits = "";
  for (const byte of bytes) bits += byte.toString(2).padStart(8, "0");
  let out = "";
  for (let i = 0; i + 5 <= bits.length; i += 5) out += BASE32[parseInt(bits.slice(i, i + 5), 2)];
  return out;
}

function base32ToBytes(secret) {
  const clean = String(secret ?? "").toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = "";
  for (const char of clean) {
    const index = BASE32.indexOf(char);
    if (index < 0) continue;
    bits += index.toString(2).padStart(5, "0");
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return new Uint8Array(bytes);
}

function counterBytes(counter) {
  const bytes = new Uint8Array(8);
  let value = Number(counter);
  for (let i = 7; i >= 0; i -= 1) {
    bytes[i] = value & 0xff;
    value = Math.floor(value / 256);
  }
  return bytes;
}

export function generateTotpSecret(byteLength = 20) {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return bytesToBase32(bytes);
}

export function totpUri({ secret, account, issuer = "Amygdala" }) {
  const label = encodeURIComponent(`${issuer}:${account}`);
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}

export async function totpCode(secret, { now = Date.now(), stepSeconds = 30 } = {}) {
  const keyBytes = base32ToBytes(secret);
  if (!keyBytes.length) return null;
  const counter = Math.floor(now / 1000 / stepSeconds);
  const key = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const hmac = new Uint8Array(await crypto.subtle.sign("HMAC", key, counterBytes(counter)));
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary = ((hmac[offset] & 0x7f) << 24) | (hmac[offset + 1] << 16) | (hmac[offset + 2] << 8) | hmac[offset + 3];
  return String(binary % 1_000_000).padStart(6, "0");
}

export async function verifyTotp(secret, code, { now = Date.now(), window = 1, stepSeconds = 30 } = {}) {
  const expected = String(code ?? "").replace(/\s+/g, "");
  if (!/^\d{6}$/.test(expected) || !secret) return false;
  for (let offset = -window; offset <= window; offset += 1) {
    const candidate = await totpCode(secret, { now: now + offset * stepSeconds * 1000, stepSeconds });
    if (candidate === expected) return true;
  }
  return false;
}
