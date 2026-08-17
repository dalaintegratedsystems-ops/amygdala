import assert from "node:assert/strict";
import test from "node:test";

async function render(path = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}-${path}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(new Request(`http://localhost${path}`, { headers: { accept: "text/html" } }), { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } }, { waitUntil() {}, passThroughOnException() {} });
}

test("landing page communicates the Amygdala value proposition", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Turn product knowledge into/);
  assert.match(html, /customer capability/);
  assert.match(html, /Enter Interactive Demo/);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton/i);
});

test("demo routes render through the shared accessible shell", async () => {
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
