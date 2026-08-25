import { env } from "cloudflare:workers";
import { competencyModels, listIntegrationConnectors } from "../../../lib/analytics.mjs";
import { authorizeIdentity, describeAdapter, enterpriseIdentityConfig } from "../../../lib/security.mjs";

export async function GET(request: Request) {
  const token = request.headers.get("x-identity-token") ?? "";
  const decision = authorizeIdentity(token, "view-admin");
  if (!decision.allowed) return Response.json({ error: "Enterprise configuration requires an administrator role.", reason: decision.reason }, { status: 403 });

  return Response.json(
    {
      identity: enterpriseIdentityConfig,
      adapter: describeAdapter(env as unknown as Record<string, unknown>),
      connectors: listIntegrationConnectors(),
      competencyModels,
      actor: { userId: decision.identity?.userId, role: decision.identity?.role, organisationId: decision.identity?.organisationId },
    },
    { headers: { "cache-control": "no-store" } },
  );
}
