import { env } from "cloudflare:workers";
import { analyzeDocumentationGaps } from "../../../lib/analytics.mjs";
import { authorizeRequest } from "../../../lib/auth.mjs";

export async function GET(request: Request) {
  const decision = await authorizeRequest(request, "view-analytics", env as unknown as Record<string, unknown>);
  if (!decision.allowed) return Response.json({ error: "Analytics requires the view-analytics capability.", reason: decision.reason }, { status: 403 });
  return Response.json({ gaps: analyzeDocumentationGaps() }, { headers: { "cache-control": "no-store" } });
}
