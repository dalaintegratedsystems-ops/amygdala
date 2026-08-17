import { answerGroundedQuestion } from "../../lib/domain.mjs";

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

  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; }
  catch { return Response.json({ error: "Invalid JSON body." }, { status: 400 }); }

  const query = typeof body.query === "string" ? body.query.trim() : "";
  const organisationId = body.organisationId === "org-nexus" ? "org-nexus" : "";
  const mode = body.mode === "guide" ? "guide" : "explain";
  const role = body.role === "Workspace Administrator" || body.role === "Team Member" ? body.role : "Project Manager";
  const currentModule = typeof body.module === "string" ? body.module.slice(0, 120) : undefined;
  if (!organisationId || query.length < 3 || query.length > 500) return Response.json({ error: "Invalid guide request." }, { status: 400 });

  const result = answerGroundedQuestion({ organisationId, query, mode, role, module: currentModule });
  console.log(JSON.stringify({ event: "ai_response", organisationId, role, module: currentModule, status: result.status, sourceIds: result.citations.map((item: { sourceId: string }) => item.sourceId), reason: result.reason, timestamp: new Date().toISOString() }));
  return Response.json(result, { headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" } });
}
