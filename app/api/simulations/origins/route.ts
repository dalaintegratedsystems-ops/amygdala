import { env } from "cloudflare:workers";
import { authorizeRequest, resolveRequestIdentity } from "../../../lib/auth.mjs";
import { getStore } from "../../../lib/store.mjs";
import { normaliseOrigin } from "../../../lib/simbuilder.mjs";

type RuntimeEnv = Record<string, unknown>;

// The per-workspace allow-list of origins that may be embedded in the
// simulator. Readable by any signed-in user (the learner runtime checks it);
// mutations require an administrator capability.
export async function GET(request: Request) {
  const principal = await resolveRequestIdentity(request, env as unknown as RuntimeEnv);
  if (!principal) return Response.json({ error: "Sign in to view allow-listed origins." }, { status: 401 });
  const store = getStore(env as unknown as RuntimeEnv);
  const origins = await store.listSimOrigins(principal.organisationId);
  return Response.json({ origins }, { headers: { "cache-control": "no-store" } });
}

export async function POST(request: Request) {
  const decision = await authorizeRequest(request, "generate-course", env as unknown as RuntimeEnv);
  if (!decision.allowed) return Response.json({ error: "Managing the allow-list requires an administrator role.", reason: decision.reason }, { status: 403 });

  let body: Record<string, unknown>;
  try { body = (await request.json()) as Record<string, unknown>; }
  catch { return Response.json({ error: "Invalid JSON body." }, { status: 400 }); }

  const origin = normaliseOrigin(typeof body.origin === "string" ? body.origin : "");
  if (!origin) return Response.json({ error: "Provide a valid http(s) origin to allow-list." }, { status: 400 });
  const label = typeof body.label === "string" ? body.label.slice(0, 120) : "";

  const store = getStore(env as unknown as RuntimeEnv);
  const organisationId = decision.principal?.organisationId as string;
  const entry = await store.addSimOrigin(organisationId, { origin, label });
  await store.recordAudit({ organisationId, actor: decision.principal?.displayName, role: decision.principal?.role, eventType: "sim.origin.allowlisted", entityType: "sim_origin", entityId: origin, detail: `origin=${origin}` });
  return Response.json({ origin: entry }, { status: 201, headers: { "cache-control": "no-store" } });
}

export async function DELETE(request: Request) {
  const decision = await authorizeRequest(request, "generate-course", env as unknown as RuntimeEnv);
  if (!decision.allowed) return Response.json({ error: "Managing the allow-list requires an administrator role.", reason: decision.reason }, { status: 403 });
  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!id) return Response.json({ error: "An allow-list entry id is required." }, { status: 400 });
  const store = getStore(env as unknown as RuntimeEnv);
  const organisationId = decision.principal?.organisationId as string;
  await store.removeSimOrigin(organisationId, id);
  await store.recordAudit({ organisationId, actor: decision.principal?.displayName, role: decision.principal?.role, eventType: "sim.origin.removed", entityType: "sim_origin", entityId: id, detail: "" });
  return Response.json({ ok: true }, { headers: { "cache-control": "no-store" } });
}
