import { env } from "cloudflare:workers";
import { extractKnowledge } from "../../../lib/ingest.mjs";
import { authorizeRequest } from "../../../lib/auth.mjs";

export async function POST(request: Request) {
  const decision = await authorizeRequest(request, "manage-sources", env as unknown as Record<string, unknown>);
  if (!decision.allowed) return Response.json({ error: "Document ingestion requires an administrator role.", reason: decision.reason }, { status: 403 });

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const result = extractKnowledge(
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
  console.log(JSON.stringify({ event: "source_ingested", actor: decision.principal?.userId, sourceId: result.source.id, engine: result.engine.engine, groundedSteps: result.summary.procedureSteps, timestamp: new Date().toISOString() }));
  return Response.json(result, { headers: { "cache-control": "no-store" } });
}
