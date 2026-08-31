import { env } from "cloudflare:workers";
import { proposeBlueprintAI } from "../../../lib/ai.mjs";
import { authorizeRequest } from "../../../lib/access.mjs";
import { getStore } from "../../../lib/store.mjs";

// Propose a course blueprint (modules, objectives, durations, difficulty,
// prerequisite ordering, rationale) the author can accept or edit BEFORE
// generation. Grounded to the supplied source; nothing is persisted here.
export async function POST(request: Request) {
  const decision = await authorizeRequest(request, "generate-course", env as unknown as Record<string, unknown>);
  if (!decision.allowed) return Response.json({ error: "Course authoring requires an approved administrator role.", reason: decision.reason }, { status: 403 });

  let body: Record<string, unknown>;
  try { body = (await request.json()) as Record<string, unknown>; }
  catch { return Response.json({ error: "Invalid JSON body." }, { status: 400 }); }

  const store = getStore(env as unknown as Record<string, unknown>);
  const organisationId = decision.principal?.organisationId;
  const inlineSource = body.source && typeof body.source === "object" ? (body.source as { id?: string }) : null;
  const sourceId = typeof body.sourceId === "string" ? body.sourceId : "";
  const source = inlineSource ?? (sourceId ? await store.getSource(organisationId, sourceId) : null);
  if (!source) return Response.json({ error: "Unknown source." }, { status: 404 });

  const blueprint = await proposeBlueprintAI(env as unknown as Record<string, unknown>, source, { generatedAt: new Date().toISOString() });
  if (!blueprint.ok) return Response.json({ error: "Could not propose a blueprint for this source.", blueprint }, { status: 422 });
  return Response.json({ blueprint }, { headers: { "cache-control": "no-store" } });
}
