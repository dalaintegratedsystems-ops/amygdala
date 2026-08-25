import { env } from "cloudflare:workers";
import { planContentReverification } from "../../../lib/governance.mjs";
import { authorizeRequest } from "../../../lib/auth.mjs";

export async function GET(request: Request) {
  const decision = await authorizeRequest(request, "view-ai-activity", env as unknown as Record<string, unknown>);
  if (!decision.allowed) return Response.json({ error: "The lifecycle plan requires an administrator role.", reason: decision.reason }, { status: 403 });
  return Response.json({ plan: planContentReverification() }, { headers: { "cache-control": "no-store" } });
}
