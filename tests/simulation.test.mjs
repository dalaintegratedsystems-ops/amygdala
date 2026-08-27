import assert from "node:assert/strict";
import test from "node:test";
import { buildInteractiveScenario, buildTranscript, escapeXml, generateProcedureDiagramSvg, scoreScenarioAttempt } from "../app/lib/simulation.mjs";
import { missions, sources } from "./fixtures/sources.mjs";

const projectSource = sources.find((source) => source.id === "src-projects");

test("generates a valid, accessible SVG diagram from a procedure", () => {
  const svg = generateProcedureDiagramSvg(projectSource, { title: projectSource.title });
  assert.match(svg, /^<svg /);
  assert.match(svg, /<\/svg>$/);
  assert.match(svg, /role="img"/);
  assert.match(svg, /aria-label=/);
  assert.match(svg, /<title>/);
});

test("diagram renders one numbered node per step", () => {
  const svg = generateProcedureDiagramSvg(projectSource);
  const nodes = svg.match(/<circle /g) ?? [];
  assert.equal(nodes.length, projectSource.procedure.length);
});

test("escapes untrusted text in the SVG", () => {
  const svg = generateProcedureDiagramSvg(["<script>alert(1)</script> & done"]);
  assert.doesNotMatch(svg, /<script>/);
  assert.match(svg, /&lt;script&gt;/);
});

test("escapeXml handles all reserved characters", () => {
  assert.equal(escapeXml(`<a href="x" b='y'>&`), "&lt;a href=&quot;x&quot; b=&#39;y&#39;&gt;&amp;");
});

test("builds a branching scenario with coaching and one correct option", () => {
  const scenario = buildInteractiveScenario(missions[0]);
  assert.equal(scenario.steps.length, missions[0].steps.length);
  for (const step of scenario.steps) {
    assert.equal(step.options.filter((option) => option.correct).length, 1);
    assert.ok(step.coaching.length > 0);
  }
  assert.equal(scenario.steps.at(-1).type, "confirm");
});

test("scenario scoring penalises errors but floors at 60", () => {
  assert.equal(scoreScenarioAttempt({ steps: 5, errors: 0 }), 100);
  assert.equal(scoreScenarioAttempt({ steps: 5, errors: 2 }), 84);
  assert.equal(scoreScenarioAttempt({ steps: 5, errors: 99 }), 60);
});

test("transcript provides a numbered caption per step", () => {
  const transcript = buildTranscript(projectSource, { title: projectSource.title });
  assert.equal(transcript.captions.length, projectSource.procedure.length);
  assert.match(transcript.transcript, /Step 1:/);
});
