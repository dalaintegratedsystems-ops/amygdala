import { env } from "cloudflare:workers";
import { authorize } from "../../lib/security.mjs";
import { authorizeRequest, resolveRequestIdentity } from "../../lib/auth.mjs";
import { getStore } from "../../lib/store.mjs";
import { normaliseOrigin, normaliseSimulationDefinition } from "../../lib/simbuilder.mjs";

type RuntimeEnv = Record<string, unknown>;

// List the tenant's vendor simulations, or fetch one by id. Any signed-in user
// may read a Published simulation (so learners can run it); listing and drafts
// require an administrator capability.
export async function GET(request: Request) {
  const principal = await resolveRequestIdentity(request, env as unknown as RuntimeEnv);
  if (!principal) return Response.json({ error: "Sign in to view simulations." }, { status: 401 });
  const store = getStore(env as unknown as RuntimeEnv);
  const url = new URL(request.url);
  const id = url.searchParams.get("id");

  if (id) {
    const simulation = await store.getSimulation(principal.organisationId, id);
    if (!simulation) return Response.json({ error: "Unknown simulation." }, { status: 404 });
    const isAdmin = authorize({ role: principal.role, action: "generate-course", actorOrganisationId: principal.organisationId }).allowed;
    if (simulation.status !== "Published" && !isAdmin) return Response.json({ error: "Unknown simulation." }, { status: 404 });
    return Response.json({ simulation }, { headers: { "cache-control": "no-store" } });
  }

  const decision = authorize({ role: principal.role, action: "generate-course", actorOrganisationId: principal.organisationId });
  if (!decision.allowed) {
    // Learners get only the published simulations in their workspace.
    const published = await store.listSimulations(principal.organisationId, { status: "Published" });
    return Response.json({ simulations: published }, { headers: { "cache-control": "no-store" } });
  }
  const simulations = await store.listSimulations(principal.organisationId);
  return Response.json({ simulations }, { headers: { "cache-control": "no-store" } });
}

// Ensure the target origin of an iframe simulation is on the workspace
// allow-list; authors curate their own list, so creating/editing a sim adds
// its origin (audited). Returns the origin, or null when not applicable.
async function ensureAllowListed(store: ReturnType<typeof getStore>, organisationId: string, actor: string | undefined, role: string | undefined, mode: string, targetUrl: string) {
  if (mode !== "iframe") return null;
  const origin = normaliseOrigin(targetUrl);
  if (!origin) return null;
  const existing = await store.listSimOrigins(organisationId);
  if (!existing.some((entry: { origin: string }) => entry.origin === origin)) {
    await store.addSimOrigin(organisationId, { origin, label: "" });
    await store.recordAudit({ organisationId, actor, role, eventType: "sim.origin.allowlisted", entityType: "sim_origin", entityId: origin, detail: `origin=${origin}` });
  }
  return origin;
}

export async function POST(request: Request) {
  const decision = await authorizeRequest(request, "generate-course", env as unknown as RuntimeEnv);
  if (!decision.allowed) return Response.json({ error: "Building a simulation requires an administrator role.", reason: decision.reason }, { status: 403 });

  let body: Record<string, unknown>;
  try { body = (await request.json()) as Record<string, unknown>; }
  catch { return Response.json({ error: "Invalid JSON body." }, { status: 400 }); }

  const validated = normaliseSimulationDefinition(body);
  if (!validated.ok || !validated.simulation) return Response.json({ error: validated.error }, { status: 400 });
  const definition = validated.simulation;

  const store = getStore(env as unknown as RuntimeEnv);
  const organisationId = decision.principal?.organisationId as string;
  await ensureAllowListed(store, organisationId, decision.principal?.displayName, decision.principal?.role, definition.mode, definition.targetUrl);

  const simulation = await store.createSimulation({ id: crypto.randomUUID(), organisationId, ...definition });
  await store.recordAudit({ organisationId, actor: decision.principal?.displayName, role: decision.principal?.role, eventType: "sim.created", entityType: "simulation", entityId: simulation.id, detail: `mode=${simulation.mode} title=${simulation.title}` });
  return Response.json({ simulation }, { status: 201, headers: { "cache-control": "no-store" } });
}

export async function PATCH(request: Request) {
  const decision = await authorizeRequest(request, "generate-course", env as unknown as RuntimeEnv);
  if (!decision.allowed) return Response.json({ error: "Editing a simulation requires an administrator role.", reason: decision.reason }, { status: 403 });

  let body: Record<string, unknown>;
  try { body = (await request.json()) as Record<string, unknown>; }
  catch { return Response.json({ error: "Invalid JSON body." }, { status: 400 }); }

  const id = typeof body.id === "string" ? body.id : "";
  if (!id) return Response.json({ error: "A simulation id is required." }, { status: 400 });

  const store = getStore(env as unknown as RuntimeEnv);
  const organisationId = decision.principal?.organisationId as string;
  const existing = await store.getSimulation(organisationId, id);
  if (!existing) return Response.json({ error: "Unknown simulation." }, { status: 404 });

  const validated = normaliseSimulationDefinition({ ...existing, ...body });
  if (!validated.ok || !validated.simulation) return Response.json({ error: validated.error }, { status: 400 });
  const definition = validated.simulation;

  await ensureAllowListed(store, organisationId, decision.principal?.displayName, decision.principal?.role, definition.mode, definition.targetUrl);
  const simulation = await store.updateSimulation(organisationId, id, definition);
  await store.recordAudit({ organisationId, actor: decision.principal?.displayName, role: decision.principal?.role, eventType: definition.status === "Published" ? "sim.published" : "sim.edited", entityType: "simulation", entityId: id, detail: `status=${simulation?.status}` });
  return Response.json({ simulation }, { headers: { "cache-control": "no-store" } });
}

export async function DELETE(request: Request) {
  const decision = await authorizeRequest(request, "generate-course", env as unknown as RuntimeEnv);
  if (!decision.allowed) return Response.json({ error: "Deleting a simulation requires an administrator role.", reason: decision.reason }, { status: 403 });
  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!id) return Response.json({ error: "A simulation id is required." }, { status: 400 });
  const store = getStore(env as unknown as RuntimeEnv);
  const organisationId = decision.principal?.organisationId as string;
  await store.deleteSimulation(organisationId, id);
  await store.recordAudit({ organisationId, actor: decision.principal?.displayName, role: decision.principal?.role, eventType: "sim.deleted", entityType: "simulation", entityId: id, detail: "" });
  return Response.json({ ok: true }, { headers: { "cache-control": "no-store" } });
}
