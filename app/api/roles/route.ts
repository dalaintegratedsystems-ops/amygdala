import { env } from "cloudflare:workers";
import { authorizeRequest } from "../../lib/access.mjs";
import { allCapabilities, capabilityCatalog, platformRoleCapabilities, roleTiers } from "../../lib/security.mjs";
import { getStore } from "../../lib/store.mjs";
import { writeAudit } from "../../lib/users.mjs";

type RuntimeEnv = Record<string, unknown>;

export async function GET(request: Request) {
  const decision = await authorizeRequest(request, "view-admin", env as unknown as RuntimeEnv);
  if (!decision.allowed) return Response.json({ error: "Administrator access required.", reason: decision.reason }, { status: 403 });
  const store = getStore(env as unknown as RuntimeEnv);
  const custom = await store.listCustomRoles(decision.principal!.organisationId);
  return Response.json({
    tiers: roleTiers,
    catalog: capabilityCatalog,
    builtIn: platformRoleCapabilities,
    custom,
  }, { headers: { "cache-control": "no-store" } });
}

export async function POST(request: Request) {
  const decision = await authorizeRequest(request, "manage-roles", env as unknown as RuntimeEnv);
  if (!decision.allowed) return Response.json({ error: "Creating roles requires the manage-roles capability.", reason: decision.reason }, { status: 403 });
  let body: Record<string, unknown>;
  try { body = (await request.json()) as Record<string, unknown>; }
  catch { return Response.json({ error: "Invalid JSON body." }, { status: 400 }); }
  const name = String(body.name ?? "").trim();
  if (!name) return Response.json({ error: "A role name is required." }, { status: 400 });
  if (Object.hasOwn(platformRoleCapabilities, name)) return Response.json({ error: "That name is a built-in tier." }, { status: 409 });
  const capabilities = Array.isArray(body.capabilities) ? body.capabilities.filter((cap): cap is string => typeof cap === "string" && allCapabilities.includes(cap)) : [];
  const store = getStore(env as unknown as RuntimeEnv);
  const role = await store.createCustomRole(decision.principal!.organisationId, { name, capabilities });
  await writeAudit(store, decision.principal, { eventType: "role.created", entityType: "role", entityId: role.id, detail: name });
  return Response.json({ role }, { status: 201, headers: { "cache-control": "no-store" } });
}

export async function PATCH(request: Request) {
  const decision = await authorizeRequest(request, "manage-roles", env as unknown as RuntimeEnv);
  if (!decision.allowed) return Response.json({ error: "Editing roles requires the manage-roles capability.", reason: decision.reason }, { status: 403 });
  let body: Record<string, unknown>;
  try { body = (await request.json()) as Record<string, unknown>; }
  catch { return Response.json({ error: "Invalid JSON body." }, { status: 400 }); }
  const id = String(body.id ?? "");
  if (!id) return Response.json({ error: "A role id is required." }, { status: 400 });
  const store = getStore(env as unknown as RuntimeEnv);
  const patch: { name?: string; capabilities?: string[] } = {};
  if (typeof body.name === "string" && body.name.trim()) patch.name = body.name.trim();
  if (Array.isArray(body.capabilities)) patch.capabilities = body.capabilities.filter((cap): cap is string => typeof cap === "string" && allCapabilities.includes(cap));
  const role = await store.updateCustomRole(decision.principal!.organisationId, id, patch);
  if (!role) return Response.json({ error: "Unknown role." }, { status: 404 });
  await writeAudit(store, decision.principal, { eventType: "role.updated", entityType: "role", entityId: id, detail: role.name });
  return Response.json({ role }, { headers: { "cache-control": "no-store" } });
}

export async function DELETE(request: Request) {
  const decision = await authorizeRequest(request, "manage-roles", env as unknown as RuntimeEnv);
  if (!decision.allowed) return Response.json({ error: "Deleting roles requires the manage-roles capability.", reason: decision.reason }, { status: 403 });
  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!id) return Response.json({ error: "A role id is required." }, { status: 400 });
  const store = getStore(env as unknown as RuntimeEnv);
  await store.deleteCustomRole(decision.principal!.organisationId, id);
  await writeAudit(store, decision.principal, { eventType: "role.deleted", entityType: "role", entityId: id, detail: "" });
  return Response.json({ ok: true }, { headers: { "cache-control": "no-store" } });
}
