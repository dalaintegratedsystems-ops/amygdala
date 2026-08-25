import { analyzeDocumentationGaps } from "../../../lib/analytics.mjs";
import { authorizeIdentity } from "../../../lib/security.mjs";

export async function GET(request: Request) {
  const token = request.headers.get("x-identity-token") ?? "";
  const decision = authorizeIdentity(token, "view-analytics");
  if (!decision.allowed) return Response.json({ error: "Analytics requires the view-analytics capability.", reason: decision.reason }, { status: 403 });
  return Response.json({ gaps: analyzeDocumentationGaps() }, { headers: { "cache-control": "no-store" } });
}
