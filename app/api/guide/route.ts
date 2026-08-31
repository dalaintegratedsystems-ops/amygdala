import { env } from "cloudflare:workers";
import { answerGroundedQuestionAI } from "../../lib/ai.mjs";
import { searchApprovedKnowledge } from "../../lib/domain.mjs";
import { retrieveRelevant } from "../../lib/retrieval.mjs";
import { resolveRequestIdentity } from "../../lib/auth.mjs";
import { getStore } from "../../lib/store.mjs";

const windows = new Map<string, { count: number; startedAt: number }>();
const WINDOW_MS = 60_000;
const MAX_REQUESTS = 20;

export async function POST(request: Request) {
  const client = request.headers.get("cf-connecting-ip") ?? "local-demo";
  const now = Date.now();
  const current = windows.get(client);
  const window = !current || now - current.startedAt > WINDOW_MS ? { count: 0, startedAt: now } : current;
  window.count += 1;
  windows.set(client, window);
  if (window.count > MAX_REQUESTS) return Response.json({ error: "Please pause before asking another question." }, { status: 429, headers: { "retry-after": "60" } });

  // The guide is grounded to the signed-in user's tenant.
  const principal = await resolveRequestIdentity(request, env as unknown as Record<string, unknown>);
  if (!principal) return Response.json({ error: "Sign in to ask the guide." }, { status: 401 });

  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; }
  catch { return Response.json({ error: "Invalid JSON body." }, { status: 400 }); }

  const query = typeof body.query === "string" ? body.query.trim() : "";
  const mode = body.mode === "guide" ? "guide" : "explain";
  const role = body.role === "Workspace Administrator" || body.role === "Team Member" ? body.role : "Project Manager";
  const currentModule = typeof body.module === "string" ? body.module.slice(0, 120) : undefined;
  if (query.length < 3 || query.length > 500) return Response.json({ error: "Invalid guide request." }, { status: 400 });

  const store = getStore(env as unknown as Record<string, unknown>);
  const sources = await store.listApprovedSources(principal.organisationId);

  // Semantic retrieval (RAG): for the top keyword-matched sources, rank their
  // stored chunks by cosine similarity to the query (keyword fallback when no
  // embeddings/key) and attach the most relevant passages for grounding.
  let retrievalEngine = "keyword";
  try {
    const matches = (searchApprovedKnowledge as (list: unknown, params: { query: string; role: string; module?: string }) => Array<{ source: { id: string; retrievedPassages?: string[] } }>)(sources, { query, role, module: currentModule }).slice(0, 3);
    for (const match of matches) {
      const chunks = await store.listKnowledgeChunks(principal.organisationId, match.source.id);
      const { engine, passages } = await retrieveRelevant(env as unknown as Record<string, unknown>, { ...match.source, knowledgeChunks: chunks }, query, { k: 3 });
      if (passages.length) {
        match.source.retrievedPassages = passages.map((passage: { content: string }) => passage.content);
        if (engine === "semantic") retrievalEngine = "semantic";
      }
    }
  } catch {
    // Retrieval augmentation is best-effort; fall back to full-text grounding.
  }

  const result = await answerGroundedQuestionAI(env as unknown as Record<string, unknown>, sources, { query, mode, role, module: currentModule });

  // Record the answer for the traceable AI activity log + gap analytics.
  await store.recordAudit({
    organisationId: principal.organisationId,
    actor: principal.displayName,
    role: principal.role,
    eventType: "ai.answer",
    entityType: "guide",
    entityId: result.citations[0]?.sourceId ?? "none",
    detail: JSON.stringify({ status: result.status, topic: currentModule ?? query.slice(0, 60), question: query.slice(0, 120), source: result.citations[0]?.title ?? null }),
  });

  console.log(JSON.stringify({ event: "ai_response", organisationId: principal.organisationId, role, module: currentModule, status: result.status, retrieval: retrievalEngine, sourceIds: result.citations.map((item: { sourceId: string }) => item.sourceId), reason: result.reason, timestamp: new Date().toISOString() }));
  return Response.json({ ...result, retrieval: retrievalEngine }, { headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" } });
}
