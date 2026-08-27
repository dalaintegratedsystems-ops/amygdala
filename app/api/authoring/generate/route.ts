import { env } from "cloudflare:workers";
import { approveCourse, summariseGeneratedCourse } from "../../../lib/authoring.mjs";
import { generateCourseFromSourceAI } from "../../../lib/ai.mjs";
import { authorizeRequest } from "../../../lib/auth.mjs";
import { getStore } from "../../../lib/store.mjs";

export async function POST(request: Request) {
  const decision = await authorizeRequest(request, "generate-course", env as unknown as Record<string, unknown>);
  if (!decision.allowed) return Response.json({ error: "Course authoring requires an approved administrator role.", reason: decision.reason }, { status: 403 });

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const store = getStore(env as unknown as Record<string, unknown>);
  const organisationId = decision.principal?.organisationId;

  // Accept a stored sourceId or an inline (already approved) source object.
  const inlineSource = body.source && typeof body.source === "object" ? (body.source as { id?: string }) : null;
  const sourceId = typeof body.sourceId === "string" ? body.sourceId : "";
  const source = inlineSource ?? (sourceId ? await store.getSource(organisationId, sourceId) : null);
  if (!source) return Response.json({ error: "Unknown source." }, { status: 404 });

  const generated = await generateCourseFromSourceAI(env as unknown as Record<string, unknown>, source, { generatedAt: new Date().toISOString() });
  if (!generated.ok) return Response.json({ error: generated.message, reason: generated.reason }, { status: 422 });

  const course = body.approve === true ? approveCourse(generated) : generated;
  const resolvedSourceId = (source as { id?: string }).id ?? sourceId;

  // Persist the generated course so it survives reloads and is available to
  // learners once published. One course per source: regeneration updates it.
  const existing = resolvedSourceId ? await store.findCourseBySource(organisationId, resolvedSourceId) : null;
  const persistedFields = {
    title: course.programme.title,
    role: course.programme.role,
    status: course.programme.status,
    approvalStatus: course.programme.approvalStatus,
    course,
  };
  const persisted = existing
    ? await store.updateCourse(organisationId, existing.id, persistedFields)
    : await store.createCourse({ id: crypto.randomUUID(), organisationId, sourceId: resolvedSourceId, ...persistedFields });
  await store.recordAudit({ organisationId, actor: decision.principal?.displayName, role: decision.principal?.role, eventType: body.approve === true ? "course.published" : "course.generated", entityType: "course", entityId: persisted.id, detail: `source=${(source as { id?: string }).id} title=${course.programme.title}` });
  console.log(JSON.stringify({ event: "course_generated", actor: decision.principal?.userId, sourceId: (source as { id?: string }).id, courseId: persisted.id, approved: body.approve === true, timestamp: new Date().toISOString() }));
  return Response.json({ course, courseId: persisted.id, summary: summariseGeneratedCourse(course) }, { headers: { "cache-control": "no-store" } });
}
