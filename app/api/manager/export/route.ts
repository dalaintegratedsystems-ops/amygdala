import { env } from "cloudflare:workers";
import { authorizeRequest } from "../../../lib/access.mjs";
import { managerReportCsv, managerSnapshot } from "../../../lib/assignments.mjs";
import { getStore } from "../../../lib/store.mjs";

type RuntimeEnv = Record<string, unknown>;

export async function GET(request: Request) {
  const decision = await authorizeRequest(request, "view-manager-dashboard", env as unknown as RuntimeEnv);
  if (!decision.allowed) return Response.json({ error: "Reporting requires the view-manager-dashboard capability.", reason: decision.reason }, { status: 403 });
  const store = getStore(env as unknown as RuntimeEnv);
  const organisationId = decision.principal!.organisationId;
  const [users, assignments, progress, courses, cohorts] = await Promise.all([
    store.listUsers(organisationId),
    store.listAssignments(organisationId),
    store.listOrgProgress(organisationId),
    store.listCourses(organisationId),
    store.listCohorts(organisationId),
  ]);
  const memberships: Record<string, string[]> = {};
  for (const user of users) memberships[user.userId] = await store.listUserCohortIds(organisationId, user.userId);
  const snapshot = managerSnapshot({ users, assignments, progress, courses, cohorts, memberships });
  return new Response(managerReportCsv(snapshot.rows), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": 'attachment; filename="amygdala-manager-report.csv"',
      "cache-control": "no-store",
    },
  });
}
