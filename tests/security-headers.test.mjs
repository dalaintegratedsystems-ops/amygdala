import assert from "node:assert/strict";
import test from "node:test";

const ASSETS = { fetch: async () => new Response("Not found", { status: 404 }) };
const ctx = { waitUntil() {}, passThroughOnException() {} };

async function fetchPath(path = "/") {
  const url = new URL("../dist/server/index.js", import.meta.url);
  url.searchParams.set("headers", `${process.pid}-${Date.now()}-${path}`);
  const { default: worker } = await import(url.href);
  return worker.fetch(new Request(`http://localhost${path}`, { headers: { accept: "text/html" } }), ASSETS, ctx);
}

test("responses carry the core security headers", async () => {
  const response = await fetchPath("/");
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("referrer-policy"), "strict-origin-when-cross-origin");
  assert.equal(response.headers.get("x-frame-options"), "DENY");
  assert.match(response.headers.get("strict-transport-security") ?? "", /max-age=\d+/);
});

test("CSP accommodates what the app needs without breaking rendering", async () => {
  const response = await fetchPath("/");
  const csp = response.headers.get("content-security-policy") ?? "";
  assert.ok(csp.length > 0, "a CSP is enforced by default");
  // Inline style attributes (CSS custom properties) + un-nonced vinext scripts.
  assert.match(csp, /style-src[^;]*'unsafe-inline'/);
  assert.match(csp, /script-src[^;]*'unsafe-inline'/);
  // R2 / next-image / blobs.
  assert.match(csp, /img-src[^;]*data:/);
  assert.match(csp, /img-src[^;]*blob:/);
  // Vendor simulator embeds allow-listed https sandboxes.
  assert.match(csp, /frame-src[^;]*https:/);
  // The app itself cannot be framed elsewhere.
  assert.match(csp, /frame-ancestors 'self'/);
  const html = await response.text();
  assert.match(html, /Turn product knowledge into/, "the landing page still renders");
});
