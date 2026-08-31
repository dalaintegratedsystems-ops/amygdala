import { env } from "cloudflare:workers";
import { authorize } from "../../lib/security.mjs";
import { resolveRequestIdentity } from "../../lib/auth.mjs";
import { authorizeRequest } from "../../lib/access.mjs";
import { getStore } from "../../lib/store.mjs";

// List courses for the tenant. Any signed-in user can read Published courses;
// Draft/all listings require an administrator capability.
export async function GET(request: Request) {
  const principal = await resolveRequestIdentity(request, env as unknown as Record<string, unknown>);
  if (!principal) return Response.json({ error: "Sign in to view courses." }, { status: 401 });

  const url = new URL(request.url);
  const status = url.searchParams.get("status") ?? "Published";
  if (status !== "Published") {
    const decision = authorize({ role: principal.role, action: "view-admin", actorOrganisationId: principal.organisationId });
    if (!decision.allowed) return Response.json({ error: "Administrator access required.", reason: decision.reason }, { status: 403 });
  }

  const store = getStore(env as unknown as Record<string, unknown>);
  const courses = await store.listCourses(principal.organisationId, status === "all" ? {} : { status });
  return Response.json({ courses }, { headers: { "cache-control": "no-store" } });
}

export async function DELETE(request: Request) {
  const decision = await authorizeRequest(request, "generate-course", env as unknown as Record<string, unknown>);
  if (!decision.allowed) return Response.json({ error: "Deleting a course requires an administrator role.", reason: decision.reason }, { status: 403 });
  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!id) return Response.json({ error: "A course id is required." }, { status: 400 });
  const store = getStore(env as unknown as Record<string, unknown>);
  const organisationId = decision.principal?.organisationId as string;
  const existing = await store.getCourse(organisationId, id);
  if (!existing) return Response.json({ error: "Unknown course." }, { status: 404 });
  await store.deleteCourse(organisationId, id);
  await store.recordAudit({ organisationId, actor: decision.principal?.displayName, role: decision.principal?.role, eventType: "course.deleted", entityType: "course", entityId: id, detail: existing.title });
  return Response.json({ ok: true }, { headers: { "cache-control": "no-store" } });
}
