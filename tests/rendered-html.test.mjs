import assert from "node:assert/strict";
import test from "node:test";

async function render(path = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}-${path}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(new Request(`http://localhost${path}`, { headers: { accept: "text/html" } }), { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } }, { waitUntil() {}, passThroughOnException() {} });
}

test("landing page communicates the Reflective Enabler SOP", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /From kit to/);
  assert.match(html, /learning momentum/);
  assert.match(html, /five-checkpoint learner kickstart/i);
  assert.match(html, /ICT &amp; Digital Platform Enablers/);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton/i);
});

test("legacy demo routes remain available through the shared shell", async () => {
  const response = await render("/admin/command-centre");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Command Centre/);
  assert.match(html, /Customer readiness/);
});

test("health endpoint reports graceful deterministic AI mode", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("health", `${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  const response = await worker.fetch(new Request("http://localhost/api/health"), { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } }, { waitUntil() {}, passThroughOnException() {} });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.status, "ok");
  assert.equal(body.aiAdapter, "deterministic-grounded");
});
