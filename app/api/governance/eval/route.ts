import { env } from "cloudflare:workers";
import { runGroundingEval } from "../../../lib/governance.mjs";
import { authorizeRequest } from "../../../lib/auth.mjs";

export async function GET(request: Request) {
  const decision = await authorizeRequest(request, "run-eval", env as unknown as Record<string, unknown>);
  if (!decision.allowed) return Response.json({ error: "Running the eval harness requires the run-eval capability.", reason: decision.reason }, { status: 403 });
  return Response.json(runGroundingEval(), { headers: { "cache-control": "no-store" } });
}
