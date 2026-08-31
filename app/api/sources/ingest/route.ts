import { env } from "cloudflare:workers";
import { extractKnowledgeAI } from "../../../lib/ai.mjs";
import { extractTypedKnowledge } from "../../../lib/knowledge.mjs";
import { embedChunksForStore } from "../../../lib/retrieval.mjs";
import { authorizeRequest } from "../../../lib/auth.mjs";
import { getStore } from "../../../lib/store.mjs";

export async function POST(request: Request) {
  const decision = await authorizeRequest(request, "manage-sources", env as unknown as Record<string, unknown>);
  if (!decision.allowed) return Response.json({ error: "Document ingestion requires an administrator role.", reason: decision.reason }, { status: 403 });

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const result = await extractKnowledgeAI(
    env as unknown as Record<string, unknown>,
    {
      title: typeof body.title === "string" ? body.title : undefined,
      module: typeof body.module === "string" ? body.module : undefined,
      filename: typeof body.filename === "string" ? body.filename : undefined,
      mimeType: typeof body.mimeType === "string" ? body.mimeType : undefined,
      text: typeof body.text === "string" ? body.text : "",
      organisationId: decision.principal?.organisationId,
      contentOwner: decision.principal?.displayName,
    },
    { env: env as unknown as Record<string, unknown>, uploadDate: new Date().toISOString().slice(0, 10) },
  );

  if (!result.ok || !result.source || !result.summary) return Response.json({ error: result.message, reason: result.reason, engine: result.engine }, { status: 422 });

  // Structure-aware extraction: a typed knowledge model (concepts, definitions,
  // procedures, entities) persisted alongside the flat chunks and used to drive
  // the right training shape during generation.
  const typed = extractTypedKnowledge(result.source.extractedText, {
    outline: result.outline,
    procedure: result.source.procedure,
    keywords: result.source.keywords,
    documentType: result.documentType,
  });

  // Persist the extracted knowledge as a Draft source pending human approval.
  const store = getStore(env as unknown as Record<string, unknown>);
  const organisationId = decision.principal?.organisationId;
  const stored = await store.createSource({
    ...result.source,
    id: crypto.randomUUID(),
    organisationId,
    status: "Ready for review",
    approvalStatus: "Pending",
    uploadDate: new Date().toISOString().slice(0, 10),
    types: typed,
  });

  // Semantic retrieval: embed the section-aware chunks (best-effort — falls
  // back to keyword retrieval when no key/network) and persist the vectors.
  try {
    const embedded = await embedChunksForStore(env as unknown as Record<string, unknown>, result.chunks);
    await store.replaceKnowledgeChunks(organisationId, stored.id, embedded);
  } catch {
    // Non-fatal: retrieval degrades to keyword / on-the-fly chunking.
  }
  await store.recordAudit({ organisationId, actor: decision.principal?.displayName, role: decision.principal?.role, eventType: "source.ingested", entityType: "source", entityId: stored.id, detail: `engine=${result.engine.engine} steps=${result.summary.procedureSteps}` });
  console.log(JSON.stringify({ event: "source_ingested", actor: decision.principal?.userId, sourceId: stored.id, engine: result.engine.engine, groundedSteps: result.summary.procedureSteps, timestamp: new Date().toISOString() }));
  return Response.json({ ...result, source: stored, types: typed }, { headers: { "cache-control": "no-store" } });
}
