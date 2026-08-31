import { env } from "cloudflare:workers";
import { authorizeRequest } from "../../lib/access.mjs";
import { sendEmail } from "../../lib/email.mjs";
import { resolveCohortMemberIds } from "../../lib/assignments.mjs";
import { getStore } from "../../lib/store.mjs";
import { writeAudit } from "../../lib/users.mjs";

type RuntimeEnv = Record<string, unknown>;

async function notifyAssignees(store: ReturnType<typeof getStore>, envBag: RuntimeEnv, organisationId: string, assignment: { targetType: string; targetId: string; courseId: string }, actor: string) {
  const users = await store.listUsers(organisationId);
  const courses = await store.listCourses(organisationId);
  const course = courses.find((entry: { id: string }) => entry.id === assignment.courseId);
  const title = course?.title ?? assignment.courseId;
  let targets = users;
  if (assignment.targetType === "user") targets = users.filter((user: { userId: string }) => user.userId === assignment.targetId);
  else if (assignment.targetType === "role") targets = users.filter((user: { role: string }) => user.role === assignment.targetId);
  else if (assignment.targetType === "cohort") {
    const cohort = await store.getCohort(organisationId, assignment.targetId);
    const memberIds = resolveCohortMemberIds(cohort, { members: await store.listCohortMembers(organisationId, assignment.targetId), users });
    targets = users.filter((user: { userId: string }) => memberIds.includes(user.userId));
  }
  for (const user of targets) {
    await store.createNotification(organisationId, { userId: user.userId, kind: "assignment", title: "New assignment", body: `${actor} assigned “${title}”.` });
    await sendEmail(envBag, { to: user.email, subject: `Assigned: ${title}`, text: `You have a new assignment: ${title}` });
  }
}

export async function GET(request: Request) {
  const decision = await authorizeRequest(request, "manage-assignments", env as unknown as RuntimeEnv);
  if (!decision.allowed) return Response.json({ error: "Assignment management requires the manage-assignments capability.", reason: decision.reason }, { status: 403 });
  const store = getStore(env as unknown as RuntimeEnv);
  const organisationId = decision.principal!.organisationId;
  const [assignments, courses, cohorts] = await Promise.all([
    store.listAssignments(organisationId),
    store.listCourses(organisationId),
    store.listCohorts(organisationId),
  ]);
  return Response.json({ assignments, courses, cohorts }, { headers: { "cache-control": "no-store" } });
}

export async function POST(request: Request) {
  const decision = await authorizeRequest(request, "manage-assignments", env as unknown as RuntimeEnv);
  if (!decision.allowed) return Response.json({ error: "Assignment management requires the manage-assignments capability.", reason: decision.reason }, { status: 403 });
  let body: Record<string, unknown>;
  try { body = (await request.json()) as Record<string, unknown>; }
  catch { return Response.json({ error: "Invalid JSON body." }, { status: 400 }); }

  const targetType = String(body.targetType ?? "");
  const targetId = String(body.targetId ?? "");
  const courseId = String(body.courseId ?? "");
  if (!["user", "cohort", "role"].includes(targetType) || !targetId || !courseId) {
    return Response.json({ error: "targetType, targetId and courseId are required." }, { status: 400 });
  }
  const store = getStore(env as unknown as RuntimeEnv);
  const organisationId = decision.principal!.organisationId;
  const assignment = await store.createAssignment(organisationId, {
    targetType,
    targetId,
    courseId,
    dueDate: typeof body.dueDate === "string" && body.dueDate ? body.dueDate : null,
    required: body.required !== false,
    note: String(body.note ?? ""),
    createdBy: decision.principal!.userId,
  });
  await notifyAssignees(store, env as unknown as RuntimeEnv, organisationId, assignment, decision.principal!.displayName);
  await writeAudit(store, decision.principal, { eventType: "assignment.created", entityType: "assignment", entityId: assignment.id, detail: `${targetType}:${targetId} → ${courseId}` });
  return Response.json({ assignment }, { status: 201, headers: { "cache-control": "no-store" } });
}

export async function DELETE(request: Request) {
  const decision = await authorizeRequest(request, "manage-assignments", env as unknown as RuntimeEnv);
  if (!decision.allowed) return Response.json({ error: "Assignment management requires the manage-assignments capability.", reason: decision.reason }, { status: 403 });
  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!id) return Response.json({ error: "An assignment id is required." }, { status: 400 });
  const store = getStore(env as unknown as RuntimeEnv);
  await store.deleteAssignment(decision.principal!.organisationId, id);
  await writeAudit(store, decision.principal, { eventType: "assignment.deleted", entityType: "assignment", entityId: id, detail: "" });
  return Response.json({ ok: true }, { headers: { "cache-control": "no-store" } });
}
