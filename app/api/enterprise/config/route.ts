import { env } from "cloudflare:workers";
import { competencyModels, listIntegrationConnectors } from "../../../lib/analytics.mjs";
import { describeAdapter, enterpriseIdentityConfig } from "../../../lib/security.mjs";
import { authorizeRequest } from "../../../lib/auth.mjs";

export async function GET(request: Request) {
  const decision = await authorizeRequest(request, "view-admin", env as unknown as Record<string, unknown>);
  if (!decision.allowed) return Response.json({ error: "Enterprise configuration requires an administrator role.", reason: decision.reason }, { status: 403 });

  return Response.json(
    {
      identity: enterpriseIdentityConfig,
      adapter: describeAdapter(env as unknown as Record<string, unknown>),
      connectors: listIntegrationConnectors(),
      competencyModels,
      actor: { userId: decision.principal?.userId, role: decision.principal?.role, organisationId: decision.principal?.organisationId },
    },
    { headers: { "cache-control": "no-store" } },
  );
}
