import assert from "node:assert/strict";
import test from "node:test";
import {
  detectEmbeddable,
  isAcceptableTarget,
  isOriginAllowed,
  normaliseOrigin,
  normaliseSimulationDefinition,
  scoreSimulationRun,
  simulationSandboxTokens,
} from "../app/lib/simbuilder.mjs";

test("normaliseOrigin lower-cases and strips path", () => {
  assert.equal(normaliseOrigin("https://Sandbox.Example.com/app/x?y=1"), "https://sandbox.example.com");
  assert.equal(normaliseOrigin("not-a-url"), null);
  assert.equal(normaliseOrigin("ftp://example.com"), null);
});

test("isAcceptableTarget rejects insecure non-local http but allows localhost", () => {
  assert.equal(isAcceptableTarget("https://sandbox.example.com").ok, true);
  assert.equal(isAcceptableTarget("http://sandbox.example.com").ok, false);
  assert.equal(isAcceptableTarget("http://localhost:5173/demo").ok, true);
  assert.equal(isAcceptableTarget("javascript:alert(1)").ok, false);
});

test("isOriginAllowed matches the workspace allow-list only", () => {
  const allow = [{ origin: "https://sandbox.example.com" }, "https://demo.acme.io"];
  assert.equal(isOriginAllowed("https://sandbox.example.com/deep/link", allow), true);
  assert.equal(isOriginAllowed("https://DEMO.acme.io/x", allow), true);
  assert.equal(isOriginAllowed("https://evil.example.com", allow), false);
  assert.equal(isOriginAllowed("https://sandbox.example.com", []), false);
});

test("detectEmbeddable blocks X-Frame-Options DENY / SAMEORIGIN", () => {
  assert.equal(detectEmbeddable({ "x-frame-options": "DENY" }, "https://app.test").embeddable, false);
  assert.equal(detectEmbeddable({ "X-Frame-Options": "SAMEORIGIN" }, "https://app.test").embeddable, false);
});

test("detectEmbeddable respects CSP frame-ancestors", () => {
  assert.equal(detectEmbeddable({ "content-security-policy": "frame-ancestors 'none'" }, "https://app.test").embeddable, false);
  assert.equal(detectEmbeddable({ "content-security-policy": "frame-ancestors https://other.test" }, "https://app.test").embeddable, false);
  assert.equal(detectEmbeddable({ "content-security-policy": "frame-ancestors *" }, "https://app.test").embeddable, true);
  assert.equal(detectEmbeddable({ "content-security-policy": "frame-ancestors https://app.test" }, "https://app.test").embeddable, true);
});

test("detectEmbeddable allows targets with no blocking headers", () => {
  const result = detectEmbeddable({ "content-type": "text/html" }, "https://app.test");
  assert.equal(result.embeddable, true);
  assert.equal(result.reason, "no-blocking-headers");
});

test("detectEmbeddable reads from a Headers instance", () => {
  const headers = new Headers({ "x-frame-options": "DENY" });
  assert.equal(detectEmbeddable(headers, "https://app.test").embeddable, false);
});

test("normaliseSimulationDefinition validates and cleans an iframe definition", () => {
  const result = normaliseSimulationDefinition({
    title: "  Create an invoice  ",
    mode: "iframe",
    targetUrl: "https://sandbox.example.com/app",
    steps: [
      { label: "Open Billing", coaching: "Billing lives in the left nav.", hotspot: { x: 10, y: 20, w: 15, h: 6 } },
      { label: "Click New invoice" },
    ],
  });
  assert.equal(result.ok, true);
  assert.equal(result.simulation.title, "Create an invoice");
  assert.equal(result.simulation.steps.length, 2);
  assert.equal(result.simulation.steps[0].hotspot.x, 10);
  assert.equal(result.simulation.steps[1].id, "step-2");
});

test("normaliseSimulationDefinition requires a URL for iframe and screens for screenshot", () => {
  assert.equal(normaliseSimulationDefinition({ title: "x", mode: "iframe", targetUrl: "" }).ok, false);
  assert.equal(normaliseSimulationDefinition({ title: "x", mode: "screenshot", screens: [] }).ok, false);
  assert.equal(normaliseSimulationDefinition({ title: "", mode: "iframe", targetUrl: "https://a.test" }).ok, false);
  const screenshot = normaliseSimulationDefinition({ title: "x", mode: "screenshot", screens: [{ key: "media/o/1.png", alt: "Home" }] });
  assert.equal(screenshot.ok, true);
  assert.equal(screenshot.simulation.screens.length, 1);
});

test("scoreSimulationRun penalises errors but floors at 60", () => {
  assert.equal(scoreSimulationRun({ steps: 5, errors: 0 }), 100);
  assert.equal(scoreSimulationRun({ steps: 5, errors: 2 }), 84);
  assert.equal(scoreSimulationRun({ steps: 5, errors: 99 }), 60);
});

test("simulation sandbox tokens never grant same-origin or top navigation", () => {
  const tokens = simulationSandboxTokens();
  assert.ok(tokens.includes("allow-scripts"));
  assert.ok(!tokens.includes("allow-same-origin"));
  assert.ok(!tokens.includes("allow-top-navigation"));
});
