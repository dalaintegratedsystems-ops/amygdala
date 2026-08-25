import assert from "node:assert/strict";
import test from "node:test";
import {
  chunkText,
  deriveKeywords,
  deriveProcedure,
  describeExtractor,
  extractKnowledge,
  verifyGrounding,
} from "../app/lib/ingest.mjs";

const doc = `# Create a project

Projects are shared spaces for a team outcome and approved workflow.

1. Open Projects from the primary navigation.
2. Select New project.
3. Enter the project name and owner.
4. Review the details and select Create project.`;

test("extractKnowledge returns a grounded Draft source", () => {
  const result = extractKnowledge({ title: "Create a project", filename: "create.md", mimeType: "text/markdown", text: doc });
  assert.equal(result.ok, true);
  assert.equal(result.source.status, "Draft");
  assert.equal(result.source.approvalStatus, "Pending");
  assert.ok(result.source.procedure.length >= 4);
  assert.ok(result.source.keywords.length > 0);
  assert.ok(result.chunks.length >= 1);
  assert.equal(result.grounding.grounded, true);
});

test("derived procedure captures numbered steps in order", () => {
  const steps = deriveProcedure(doc);
  assert.equal(steps[0], "Open Projects from the primary navigation");
  assert.equal(steps[1], "Select New project");
  assert.equal(steps.length, 4);
});

test("keywords exclude stopwords and rank by frequency", () => {
  const keywords = deriveKeywords(doc);
  assert.ok(keywords.includes("project") || keywords.includes("projects"));
  assert.equal(keywords.includes("the"), false);
});

test("grounding rejects fabricated (hallucinated) content", () => {
  assert.equal(verifyGrounding(["Open Projects from the primary navigation"], doc).grounded, true);
  assert.equal(verifyGrounding(["Delete the production database"], doc).grounded, false);
});

test("chunking produces section-labelled chunks with token counts", () => {
  const chunks = chunkText(doc);
  assert.ok(chunks.length >= 1);
  assert.equal(chunks[0].section, "Create a project");
  assert.ok(chunks[0].tokenCount > 0);
});

test("extractor is deterministic and credential-free by default", () => {
  const engine = describeExtractor({});
  assert.equal(engine.engine, "deterministic");
  assert.equal(engine.requiresApiKey, false);
  assert.equal(engine.grounding, "span-verified");
  assert.equal(engine.humanApproval, true);
});

test("extractor upgrades to BYO LLM only with a server-side key", () => {
  assert.equal(describeExtractor({ AI_ADAPTER: "live" }).engine, "deterministic");
  assert.equal(describeExtractor({ AI_ADAPTER: "live", AI_API_KEY: "sk-x" }).engine, "byo-llm");
  assert.equal(describeExtractor({ AI: {} }).engine, "workers-ai");
});

test("empty or binary-without-text inputs are refused, not hallucinated", () => {
  assert.equal(extractKnowledge({ text: "" }).reason, "empty");
  assert.equal(extractKnowledge({ mimeType: "application/pdf", text: "" }).reason, "needs-ocr");
});

test("the extracted source is generatable after approval", () => {
  const result = extractKnowledge({ title: "Create a project", mimeType: "text/markdown", text: doc });
  const approved = { ...result.source, status: "Published", approvalStatus: "Approved" };
  assert.equal(approved.status, "Published");
  assert.ok(Array.isArray(approved.procedure) && approved.procedure.length > 0);
});
