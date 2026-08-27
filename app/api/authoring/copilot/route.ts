import { env } from "cloudflare:workers";
import { authoringCopilotAI } from "../../../lib/ai.mjs";
import { authorizeRequest } from "../../../lib/auth.mjs";
import { getStore } from "../../../lib/store.mjs";

const ACTIONS = new Set(["make-concise", "rewrite-nontechnical", "expand", "objective", "generate-questions"]);

// Grounded authoring copilot: scoped strictly to the approved source. Actions
// return AI text (or grounded quiz questions) plus citations + source spans.
// Nothing publishes; the author reviews and applies suggestions manually.
export async function POST(request: Request) {
  const decision = await authorizeRequest(request, "generate-course", env as unknown as Record<string, unknown>);
  if (!decision.allowed) return Response.json({ error: "The authoring copilot requires an administrator role.", reason: decision.reason }, { status: 403 });

  let body: Record<string, unknown>;
  try { body = (await request.json()) as Record<string, unknown>; }
  catch { return Response.json({ error: "Invalid JSON body." }, { status: 400 }); }

  const action = typeof body.action === "string" ? body.action : "";
  if (!ACTIONS.has(action)) return Response.json({ error: "Unknown copilot action." }, { status: 400 });

  const store = getStore(env as unknown as Record<string, unknown>);
  const organisationId = decision.principal?.organisationId;
  const inlineSource = body.source && typeof body.source === "object" ? (body.source as { id?: string }) : null;
  const sourceId = typeof body.sourceId === "string" ? body.sourceId : "";
  const source = inlineSource ?? (sourceId ? await store.getSource(organisationId, sourceId) : null);
  if (!source) return Response.json({ error: "Unknown source." }, { status: 404 });

  const text = typeof body.text === "string" ? body.text.slice(0, 4000) : "";
  const result = await authoringCopilotAI(env as unknown as Record<string, unknown>, { action, text, source });
  return Response.json(result, { headers: { "cache-control": "no-store" } });
}
