// Semantic retrieval (RAG) over a source's stored knowledge chunks.
//
// Design contract, mirroring the rest of the AI layer:
//  - Embeddings are an OPTIONAL upgrade. When an OpenAI key + stored vectors
//    are available, retrieval ranks passages by cosine similarity. Otherwise
//    it falls back to deterministic keyword overlap, so the feature works
//    credential-free and offline (and in tests) with the identical shape.
//  - Everything ranking-related is pure so it is unit-testable without network.
//  - Retrieval only ever exposes the supplied source's own chunks; the caller
//    is responsible for tenant-scoping the source it passes in.

import { embedTexts, NO_KEY } from "./ai.mjs";
import { chunkText, estimateTokens } from "./ingest.mjs";

// Cosine similarity of two equal-length numeric vectors. Returns 0 for
// mismatched / empty / zero-magnitude inputs rather than throwing.
export function cosineSimilarity(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < a.length; i += 1) {
    const x = Number(a[i]) || 0;
    const y = Number(b[i]) || 0;
    dot += x * y;
    magA += x * x;
    magB += y * y;
  }
  if (magA === 0 || magB === 0) return 0;
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

function tokenSet(text) {
  return new Set(String(text ?? "").toLowerCase().match(/[a-z0-9]{3,}/g) ?? []);
}

// Deterministic keyword-overlap score in [0,1]: Jaccard-ish overlap of the
// query terms present in a passage, lightly weighted by term coverage.
export function keywordScore(query, text) {
  const queryTokens = tokenSet(query);
  if (queryTokens.size === 0) return 0;
  const passageTokens = tokenSet(text);
  if (passageTokens.size === 0) return 0;
  let hits = 0;
  for (const token of queryTokens) if (passageTokens.has(token)) hits += 1;
  return hits / queryTokens.size;
}

// Rank chunks that already carry a numeric `embedding` by cosine to a query
// vector. Chunks without a usable embedding are skipped.
export function rankByEmbedding(chunks, queryVector, k = 4) {
  const scored = (Array.isArray(chunks) ? chunks : [])
    .filter((chunk) => Array.isArray(chunk?.embedding) && chunk.embedding.length)
    .map((chunk) => ({ chunk, score: cosineSimilarity(chunk.embedding, queryVector) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(1, k));
  return scored.map(({ chunk, score }) => ({ section: chunk.section ?? "", content: chunk.content ?? "", score: Number(score.toFixed(4)) }));
}

// Deterministic keyword ranking fallback.
export function rankByKeyword(chunks, query, k = 4) {
  return rankHybrid(chunks, query, null, k);
}

// Blend cosine (when a query vector is present) with keyword overlap so a
// near-paraphrase still surfaces the approved passage. Keyword-only when
// embeddings are missing. Floor is intentionally low (> 0) so we never drop
// a weakly similar but still on-topic chunk; callers still ground on text.
export function rankHybrid(chunks, query, queryVector = null, k = 4) {
  const list = Array.isArray(chunks) ? chunks : [];
  const hasQueryVector = Array.isArray(queryVector) && queryVector.length > 0;
  const scored = list
    .map((chunk) => {
      const keyword = keywordScore(query, `${chunk.section ?? ""} ${chunk.content ?? ""}`);
      const usable = hasQueryVector && Array.isArray(chunk?.embedding) && chunk.embedding.length;
      const semantic = usable ? cosineSimilarity(chunk.embedding, queryVector) : 0;
      const score = usable ? 0.55 * semantic + 0.45 * keyword : keyword;
      return { chunk, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(1, k));
  const chosen = scored.length ? scored : list.slice(0, Math.max(1, k)).map((chunk) => ({ chunk, score: 0 }));
  return chosen.map(({ chunk, score }) => ({ section: chunk.section ?? "", content: chunk.content ?? "", score: Number(score.toFixed(4)) }));
}

// Resolve the chunk list for a source: prefer persisted knowledge chunks
// (which may carry embeddings), else reconstruct plain chunks from the stored
// text so keyword retrieval still works before any embeddings exist.
function resolveChunks(source) {
  const stored = Array.isArray(source?.knowledgeChunks) ? source.knowledgeChunks : [];
  if (stored.length) return stored;
  const text = typeof source?.extractedText === "string" ? source.extractedText : "";
  if (!text) return [];
  return chunkText(text).map((chunk) => ({ section: chunk.section, content: chunk.content, tokenCount: chunk.tokenCount, embedding: null }));
}

// Retrieve the top-k most relevant passages of a source for a query.
// Uses cosine over stored embeddings when possible; otherwise keyword overlap.
// Returns { engine, passages: [{ section, content, score }] }.
export async function retrieveRelevant(env, source, query, { k = 4 } = {}) {
  const chunks = resolveChunks(source);
  if (chunks.length === 0) return { engine: "none", passages: [] };

  const hasVectors = chunks.some((chunk) => Array.isArray(chunk.embedding) && chunk.embedding.length);
  if (hasVectors) {
    try {
      const [queryVector] = await embedTexts(env, [query]);
      if (Array.isArray(queryVector) && queryVector.length) {
        const passages = rankHybrid(chunks, query, queryVector, k);
        if (passages.length) return { engine: "semantic", passages };
      }
    } catch (error) {
      if (error?.code !== NO_KEY) {
        // Non-key failures (network / rate limit) also fall through to keyword.
      }
    }
  }
  return { engine: "keyword", passages: rankHybrid(chunks, query, null, k) };
}

// Prepare chunks for persistence: attach token counts and (optionally) freshly
// computed embeddings. Best-effort — on any embeddings failure the chunks are
// returned without vectors so keyword retrieval still applies.
export async function embedChunksForStore(env, chunks) {
  const list = (Array.isArray(chunks) ? chunks : []).map((chunk) => ({
    section: chunk.section ?? "",
    content: chunk.content ?? "",
    tokenCount: chunk.tokenCount ?? estimateTokens(chunk.content ?? ""),
    embedding: null,
  }));
  if (list.length === 0) return list;
  try {
    const vectors = await embedTexts(env, list.map((chunk) => `${chunk.section}\n${chunk.content}`));
    if (vectors.length === list.length) {
      list.forEach((chunk, index) => { chunk.embedding = vectors[index]; });
    }
  } catch {
    // No key / network error: leave embeddings null (keyword retrieval).
  }
  return list;
}
