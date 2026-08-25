import { planContentReverification } from "../../../lib/governance.mjs";
import { authorizeIdentity } from "../../../lib/security.mjs";

export async function GET(request: Request) {
  const token = request.headers.get("x-identity-token") ?? "";
  const decision = authorizeIdentity(token, "view-ai-activity");
  if (!decision.allowed) return Response.json({ error: "The lifecycle plan requires an administrator role.", reason: decision.reason }, { status: 403 });
  return Response.json({ plan: planContentReverification() }, { headers: { "cache-control": "no-store" } });
}
