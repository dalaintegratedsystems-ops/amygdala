import { env } from "cloudflare:workers";
import { resolveRequestIdentity } from "../../../lib/auth.mjs";
import { assignmentsForUser, decorateAssignment, effectiveCohortIds } from "../../../lib/assignments.mjs";
import { getStore } from "../../../lib/store.mjs";

type RuntimeEnv = Record<string, unknown>;

export async function GET(request: Request) {
  const principal = await resolveRequestIdentity(request, env as unknown as RuntimeEnv);
  if (!principal) return Response.json({ error: "Sign in to view your assignments." }, { status: 401 });
  const store = getStore(env as unknown as RuntimeEnv);
  const organisationId = principal.organisationId;
  const [assignments, courses, cohorts, explicit, progress] = await Promise.all([
    store.listAssignments(organisationId),
    store.listCourses(organisationId, { status: "Published" }),
    store.listCohorts(organisationId),
    store.listUserCohortIds(organisationId, principal.userId),
    store.listLearnerProgress(organisationId, principal.userId),
  ]);
  const cohortIds = effectiveCohortIds(principal, cohorts, explicit);
  const mine = assignmentsForUser(principal, assignments, { cohortIds });
  const progressByCourse = new Map(progress.map((entry: { courseId: string }) => [entry.courseId, entry]));
  const courseById = new Map(courses.map((course: { id: string; title?: string }) => [course.id, course]));
  const items = mine.map((assignment) => decorateAssignment(assignment, {
    course: courseById.get(String(assignment.courseId)) as { title?: string } | undefined,
    progress: progressByCourse.get(String(assignment.courseId)) as Record<string, unknown> | undefined,
  }));
  return Response.json({ assignments: items }, { headers: { "cache-control": "no-store" } });
}
