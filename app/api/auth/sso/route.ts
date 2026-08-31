import { env } from "cloudflare:workers";
import { ssoNotLive } from "../../../lib/provisioning.mjs";
import { getStore } from "../../../lib/store.mjs";

type RuntimeEnv = Record<string, unknown>;

// SSO just-in-time seam. The endpoint accepts a future IdP assertion shape
// and persists group→role mapping in provisioning config, but it never
// pretends a live IdP is connected.
export async function POST(request: Request) {
  const store = getStore(env as unknown as RuntimeEnv);
  const config = await store.getProvisioningConfig("org-primary");
  return Response.json(ssoNotLive({ ssoEnabled: Boolean(config.ssoEnabled), groupRoleMap: config.groupRoleMap }), { status: 501 });
}

export async function GET() {
  return Response.json(ssoNotLive(), { status: 501 });
}
