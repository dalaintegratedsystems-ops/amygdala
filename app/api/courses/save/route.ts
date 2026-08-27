import { env } from "cloudflare:workers";
import { approveCourse } from "../../../lib/authoring.mjs";
import { authorizeRequest } from "../../../lib/auth.mjs";
import { getStore } from "../../../lib/store.mjs";

// Persist author edits to a generated course (block-editor autosave, applied
// architect suggestions, manual tweaks). Optionally publish on save. The
// course stays grounded to its source; human approval remains explicit.
export async function POST(request: Request) {
  const decision = await authorizeRequest(request, "generate-course", env as unknown as Record<string, unknown>);
  if (!decision.allowed) return Response.json({ error: "Editing a course requires an administrator role.", reason: decision.reason }, { status: 403 });

  let body: Record<string, unknown>;
  try { body = (await request.json()) as Record<string, unknown>; }
  catch { return Response.json({ error: "Invalid JSON body." }, { status: 400 }); }

  const courseId = typeof body.courseId === "string" ? body.courseId : "";
  if (!courseId) return Response.json({ error: "A courseId is required." }, { status: 400 });
  if (!body.course || typeof body.course !== "object") return Response.json({ error: "A course object is required." }, { status: 400 });

  const store = getStore(env as unknown as Record<string, unknown>);
  const organisationId = decision.principal?.organisationId;
  const existing = await store.getCourse(organisationId, courseId);
  if (!existing) return Response.json({ error: "Unknown course." }, { status: 404 });

  let course = body.course as { programme?: { title?: string; role?: string; status?: string; approvalStatus?: string } };
  if (body.approve === true) course = approveCourse(course as never) as typeof course;

  const persistedFields = {
    title: course.programme?.title ?? existing.title,
    role: course.programme?.role ?? existing.role,
    status: course.programme?.status ?? existing.status,
    approvalStatus: course.programme?.approvalStatus ?? existing.approvalStatus,
    course,
  };
  const persisted = await store.updateCourse(organisationId, courseId, persistedFields);
  await store.recordAudit({ organisationId, actor: decision.principal?.displayName, role: decision.principal?.role, eventType: body.approve === true ? "course.published" : "course.edited", entityType: "course", entityId: courseId, detail: `title=${persistedFields.title}` });
  return Response.json({ course: persisted?.course, courseId, status: persisted?.status }, { headers: { "cache-control": "no-store" } });
}
