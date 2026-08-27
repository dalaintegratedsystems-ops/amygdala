import { env } from "cloudflare:workers";
import { extractKnowledgeAI } from "../../../lib/ai.mjs";
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
  });
  await store.recordAudit({ organisationId, actor: decision.principal?.displayName, role: decision.principal?.role, eventType: "source.ingested", entityType: "source", entityId: stored.id, detail: `engine=${result.engine.engine} steps=${result.summary.procedureSteps}` });
  console.log(JSON.stringify({ event: "source_ingested", actor: decision.principal?.userId, sourceId: stored.id, engine: result.engine.engine, groundedSteps: result.summary.procedureSteps, timestamp: new Date().toISOString() }));
  return Response.json({ ...result, source: stored }, { headers: { "cache-control": "no-store" } });
}
