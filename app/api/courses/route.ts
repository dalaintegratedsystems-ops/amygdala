import { env } from "cloudflare:workers";
import { authorize } from "../../lib/security.mjs";
import { resolveRequestIdentity } from "../../lib/auth.mjs";
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
