import assert from "node:assert/strict";
import test from "node:test";
import {
  cosineSimilarity,
  embedChunksForStore,
  keywordScore,
  rankByEmbedding,
  rankByKeyword,
  rankHybrid,
  retrieveRelevant,
} from "../app/lib/retrieval.mjs";
import { embedTexts, NO_KEY } from "../app/lib/ai.mjs";

// All offline: no OPENAI key is provided, so embeddings throw NO_KEY and
// retrieval falls back to deterministic keyword ranking. No network calls.

test("cosineSimilarity handles aligned, orthogonal and degenerate vectors", () => {
  assert.equal(cosineSimilarity([1, 0], [1, 0]), 1);
  assert.equal(cosineSimilarity([1, 0], [0, 1]), 0);
  assert.equal(cosineSimilarity([1, 2, 3], []), 0);
  assert.equal(cosineSimilarity([0, 0], [1, 1]), 0);
  assert.ok(cosineSimilarity([1, 1], [1, 0]) > 0 && cosineSimilarity([1, 1], [1, 0]) < 1);
});

test("rankByEmbedding orders chunks by cosine to the query vector", () => {
  const chunks = [
    { section: "A", content: "alpha", embedding: [1, 0, 0] },
    { section: "B", content: "beta", embedding: [0, 1, 0] },
    { section: "C", content: "gamma", embedding: [0.9, 0.1, 0] },
    { section: "D", content: "no vector" },
  ];
  const ranked = rankByEmbedding(chunks, [1, 0, 0], 2);
  assert.equal(ranked.length, 2);
  assert.equal(ranked[0].section, "A");
  assert.equal(ranked[1].section, "C");
});

test("keywordScore and rankByKeyword rank by query-term overlap", () => {
  assert.ok(keywordScore("language policy", "The language policy of a public school") > 0);
  assert.equal(keywordScore("", "anything"), 0);
  const chunks = [
    { section: "1", content: "Admission to public schools without discrimination." },
    { section: "2", content: "The language policy of the governing body." },
  ];
  const ranked = rankByKeyword(chunks, "language policy governing", 1);
  assert.equal(ranked[0].section, "2");
});

test("rankHybrid blends keyword overlap with cosine so paraphrases still rank", () => {
  const chunks = [
    { section: "A", content: "Select New automation and review the summary.", embedding: [0, 1, 0] },
    { section: "B", content: "Unrelated billing settings.", embedding: [1, 0, 0] },
  ];
  const ranked = rankHybrid(chunks, "create a new automation", [0.2, 0.8, 0], 1);
  assert.equal(ranked[0].section, "A");
  assert.ok(ranked[0].score > 0);
});

test("retrieveRelevant falls back to keyword ranking without a key", async () => {
  const source = {
    id: "s1",
    extractedText: "",
    knowledgeChunks: [
      { section: "1", content: "Compulsory attendance for every learner.", embedding: null },
      { section: "2", content: "The language policy of a public school.", embedding: null },
    ],
  };
  const result = await retrieveRelevant({}, source, "language policy", { k: 1 });
  assert.equal(result.engine, "keyword");
  assert.equal(result.passages.length, 1);
  assert.equal(result.passages[0].section, "2");
});

test("retrieveRelevant reconstructs chunks from stored text when none persisted", async () => {
  const source = { id: "s2", extractedText: "# Language\n\nThe language policy of a public school is set by the governing body.\n\n# Admission\n\nAdmission must not discriminate." };
  const result = await retrieveRelevant({}, source, "language policy governing body", { k: 1 });
  assert.ok(result.passages.length >= 1);
  assert.match(result.passages[0].content, /language/i);
});

test("embedTexts throws the NO_KEY sentinel without a key", async () => {
  await assert.rejects(() => embedTexts({}, ["hello"]), (error) => error.code === NO_KEY);
});

test("embedChunksForStore returns chunks with null embeddings when no key", async () => {
  const chunks = [{ section: "A", content: "alpha beta" }, { section: "B", content: "gamma delta" }];
  const stored = await embedChunksForStore({}, chunks);
  assert.equal(stored.length, 2);
  assert.equal(stored[0].embedding, null);
  assert.ok(stored[0].tokenCount > 0);
});
