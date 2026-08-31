import { env } from "cloudflare:workers";
import { authorizeRequest } from "../../lib/access.mjs";
import { describeProvisioningSeam } from "../../lib/provisioning.mjs";
import { getStore } from "../../lib/store.mjs";
import { writeAudit } from "../../lib/users.mjs";

type RuntimeEnv = Record<string, unknown>;

function publicConfig(config: { ssoEnabled: boolean; scimEnabled: boolean; allowedDomains: string[]; groupRoleMap: Record<string, string>; defaultRole: string; scimTokenHash?: string }) {
  return {
    ...describeProvisioningSeam(config),
    scimTokenSet: Boolean(config.scimTokenHash),
  };
}

export async function GET(request: Request) {
  const decision = await authorizeRequest(request, "manage-provisioning", env as unknown as RuntimeEnv);
  if (!decision.allowed) return Response.json({ error: "Provisioning config requires the manage-provisioning capability.", reason: decision.reason }, { status: 403 });
  const store = getStore(env as unknown as RuntimeEnv);
  const config = await store.getProvisioningConfig(decision.principal!.organisationId);
  return Response.json({ config: publicConfig(config) }, { headers: { "cache-control": "no-store" } });
}

export async function POST(request: Request) {
  const decision = await authorizeRequest(request, "manage-provisioning", env as unknown as RuntimeEnv);
  if (!decision.allowed) return Response.json({ error: "Provisioning config requires the manage-provisioning capability.", reason: decision.reason }, { status: 403 });
  let body: Record<string, unknown>;
  try { body = (await request.json()) as Record<string, unknown>; }
  catch { return Response.json({ error: "Invalid JSON body." }, { status: 400 }); }
  const store = getStore(env as unknown as RuntimeEnv);
  const organisationId = decision.principal!.organisationId;
  const patch: Record<string, unknown> = {};
  if (typeof body.ssoEnabled === "boolean") patch.ssoEnabled = body.ssoEnabled;
  if (typeof body.scimEnabled === "boolean") patch.scimEnabled = body.scimEnabled;
  if (Array.isArray(body.allowedDomains)) patch.allowedDomains = body.allowedDomains.map((domain) => String(domain).trim().toLowerCase()).filter(Boolean);
  if (body.groupRoleMap && typeof body.groupRoleMap === "object") patch.groupRoleMap = body.groupRoleMap;
  if (typeof body.defaultRole === "string" && body.defaultRole.trim()) patch.defaultRole = body.defaultRole.trim();
  if (typeof body.scimToken === "string") {
    const token = body.scimToken.trim();
    patch.scimTokenHash = token ? await hashToken(token) : "";
  }
  const config = await store.upsertProvisioningConfig(organisationId, patch);
  await writeAudit(store, decision.principal, { eventType: "provisioning.updated", entityType: "provisioning", entityId: organisationId, detail: `sso=${config.ssoEnabled} scim=${config.scimEnabled}` });
  return Response.json({ config: publicConfig(config) }, { headers: { "cache-control": "no-store" } });
}

async function hashToken(token: string) {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)));
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}
