import { env } from "cloudflare:workers";
import { authorizeRequest } from "../../lib/access.mjs";
import { resolveCohortMemberIds } from "../../lib/assignments.mjs";
import { getStore } from "../../lib/store.mjs";
import { writeAudit } from "../../lib/users.mjs";

type RuntimeEnv = Record<string, unknown>;

export async function GET(request: Request) {
  const decision = await authorizeRequest(request, "manage-cohorts", env as unknown as RuntimeEnv);
  if (!decision.allowed) return Response.json({ error: "Cohort management requires the manage-cohorts capability.", reason: decision.reason }, { status: 403 });
  const store = getStore(env as unknown as RuntimeEnv);
  const organisationId = decision.principal!.organisationId;
  const users = await store.listUsers(organisationId);
  const cohorts = await store.listCohorts(organisationId);
  const decorated = [];
  for (const cohort of cohorts) {
    const explicit = await store.listCohortMembers(organisationId, cohort.id);
    const memberIds = resolveCohortMemberIds(cohort, { members: explicit, users });
    decorated.push({ ...cohort, memberIds, memberCount: memberIds.length });
  }
  return Response.json({ cohorts: decorated, users }, { headers: { "cache-control": "no-store" } });
}

export async function POST(request: Request) {
  const decision = await authorizeRequest(request, "manage-cohorts", env as unknown as RuntimeEnv);
  if (!decision.allowed) return Response.json({ error: "Cohort management requires the manage-cohorts capability.", reason: decision.reason }, { status: 403 });
  let body: Record<string, unknown>;
  try { body = (await request.json()) as Record<string, unknown>; }
  catch { return Response.json({ error: "Invalid JSON body." }, { status: 400 }); }
  const name = String(body.name ?? "").trim();
  if (!name) return Response.json({ error: "A cohort name is required." }, { status: 400 });
  const store = getStore(env as unknown as RuntimeEnv);
  const cohort = await store.createCohort(decision.principal!.organisationId, {
    name,
    description: String(body.description ?? ""),
    autoEnrolRole: String(body.autoEnrolRole ?? ""),
  });
  const memberIds = Array.isArray(body.memberIds) ? body.memberIds.filter((id): id is string => typeof id === "string") : [];
  for (const userId of memberIds) await store.addCohortMember(decision.principal!.organisationId, cohort.id, userId);
  await writeAudit(store, decision.principal, { eventType: "cohort.created", entityType: "cohort", entityId: cohort.id, detail: name });
  return Response.json({ cohort: { ...cohort, memberIds, memberCount: memberIds.length } }, { status: 201, headers: { "cache-control": "no-store" } });
}

export async function PATCH(request: Request) {
  const decision = await authorizeRequest(request, "manage-cohorts", env as unknown as RuntimeEnv);
  if (!decision.allowed) return Response.json({ error: "Cohort management requires the manage-cohorts capability.", reason: decision.reason }, { status: 403 });
  let body: Record<string, unknown>;
  try { body = (await request.json()) as Record<string, unknown>; }
  catch { return Response.json({ error: "Invalid JSON body." }, { status: 400 }); }
  const id = String(body.id ?? "");
  if (!id) return Response.json({ error: "A cohort id is required." }, { status: 400 });
  const store = getStore(env as unknown as RuntimeEnv);
  const organisationId = decision.principal!.organisationId;
  const patch: Record<string, string> = {};
  for (const key of ["name", "description", "autoEnrolRole"] as const) {
    if (typeof body[key] === "string") patch[key] = body[key] as string;
  }
  const cohort = await store.updateCohort(organisationId, id, patch);
  if (!cohort) return Response.json({ error: "Unknown cohort." }, { status: 404 });
  if (Array.isArray(body.memberIds)) {
    const next = new Set(body.memberIds.filter((value): value is string => typeof value === "string"));
    const current = await store.listCohortMembers(organisationId, id);
    for (const userId of current) if (!next.has(userId)) await store.removeCohortMember(organisationId, id, userId);
    for (const userId of next) if (!current.includes(userId)) await store.addCohortMember(organisationId, id, userId);
  }
  await writeAudit(store, decision.principal, { eventType: "cohort.updated", entityType: "cohort", entityId: id, detail: cohort.name });
  return Response.json({ cohort }, { headers: { "cache-control": "no-store" } });
}

export async function DELETE(request: Request) {
  const decision = await authorizeRequest(request, "manage-cohorts", env as unknown as RuntimeEnv);
  if (!decision.allowed) return Response.json({ error: "Cohort management requires the manage-cohorts capability.", reason: decision.reason }, { status: 403 });
  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!id) return Response.json({ error: "A cohort id is required." }, { status: 400 });
  const store = getStore(env as unknown as RuntimeEnv);
  await store.deleteCohort(decision.principal!.organisationId, id);
  await writeAudit(store, decision.principal, { eventType: "cohort.deleted", entityType: "cohort", entityId: id, detail: "" });
  return Response.json({ ok: true }, { headers: { "cache-control": "no-store" } });
}
