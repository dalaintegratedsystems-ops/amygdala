import { runGroundingEval } from "../../../lib/governance.mjs";
import { authorizeIdentity } from "../../../lib/security.mjs";

export async function GET(request: Request) {
  const token = request.headers.get("x-identity-token") ?? "";
  const decision = authorizeIdentity(token, "run-eval");
  if (!decision.allowed) return Response.json({ error: "Running the eval harness requires the run-eval capability.", reason: decision.reason }, { status: 403 });
  return Response.json(runGroundingEval(), { headers: { "cache-control": "no-store" } });
}
