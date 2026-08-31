import { env } from "cloudflare:workers";
import { resolveRequestIdentity } from "../../../lib/auth.mjs";
import { getStore } from "../../../lib/store.mjs";

export async function GET(request: Request) {
  const principal = await resolveRequestIdentity(request, env as unknown as Record<string, unknown>);
  if (!principal) return Response.json({ error: "Not authenticated." }, { status: 401 });
  const store = getStore(env as unknown as Record<string, unknown>);
  const profile = await store.getUserProfile(principal.organisationId, principal.userId);
  return Response.json({ user: { ...principal, status: profile.status, mfaEnabled: Boolean(profile.mfaEnabled) } }, { headers: { "cache-control": "no-store" } });
}
