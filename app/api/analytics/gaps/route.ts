import { env } from "cloudflare:workers";
import { analyzeDocumentationGaps } from "../../../lib/analytics.mjs";
import { authorizeRequest } from "../../../lib/access.mjs";
import { getStore } from "../../../lib/store.mjs";

// Derive documentation gaps from real recorded AI activity (guide answers).
export async function GET(request: Request) {
  const decision = await authorizeRequest(request, "view-analytics", env as unknown as Record<string, unknown>);
  if (!decision.allowed) return Response.json({ error: "Analytics requires the view-analytics capability.", reason: decision.reason }, { status: 403 });

  const store = getStore(env as unknown as Record<string, unknown>);
  const events = await store.listAudit(decision.principal?.organisationId);
  const activity = events
    .filter((event: { eventType: string }) => event.eventType === "ai.answer")
    .map((event: { detail: string; role?: string }) => {
      let parsed: { status?: string; topic?: string } = {};
      try { parsed = JSON.parse(event.detail); } catch { parsed = {}; }
      return { topic: parsed.topic ?? "Uncategorised", status: parsed.status ?? "Not covered", organisation: decision.principal?.organisationId };
    });

  return Response.json({ gaps: analyzeDocumentationGaps(activity) }, { headers: { "cache-control": "no-store" } });
}
