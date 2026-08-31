import { env } from "cloudflare:workers";
import { approveCourse, summariseGeneratedCourse } from "../../../lib/authoring.mjs";
import { generateCourseFromSourceAI } from "../../../lib/ai.mjs";
import { retrieveRelevant } from "../../../lib/retrieval.mjs";
import { enrichCoursePedagogy } from "../../../lib/pedagogy.mjs";
import { assessCourseCoverage } from "../../../lib/coverage.mjs";
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

  const resolvedSourceId = (source as { id?: string }).id ?? sourceId;

  // Semantic retrieval (RAG): attach the passages most relevant to the source's
  // concept so the grounded LLM lesson bodies draw on the strongest evidence.
  const typedSource = source as { explanation?: string; title?: string; retrievedPassages?: string[] };
  try {
    if (resolvedSourceId) {
      const chunks = await store.listKnowledgeChunks(organisationId, resolvedSourceId);
      const query = typedSource.explanation || typedSource.title || "";
      const { passages } = await retrieveRelevant(env as unknown as Record<string, unknown>, { ...(source as object), knowledgeChunks: chunks }, query, { k: 4 });
      if (passages.length) typedSource.retrievedPassages = passages.map((passage: { content: string }) => passage.content);
    }
  } catch {
    // Best-effort; generation still works from the full approved text.
  }

  const generated = await generateCourseFromSourceAI(env as unknown as Record<string, unknown>, source, { generatedAt: new Date().toISOString() });
  if (!generated.ok) return Response.json({ error: generated.message, reason: generated.reason }, { status: 422 });

  // Pedagogy-aware enrichment (Bloom objectives, varied grounded question types,
  // rationale + difficulty) and a grounding/coverage assessment for the author.
  const typedKnowledge = (source as { types?: Record<string, unknown> }).types ?? {};
  const enriched = enrichCoursePedagogy(generated, source, typedKnowledge);
  enriched.coverageReport = assessCourseCoverage(source, enriched);

  const course = body.approve === true ? approveCourse(enriched) : enriched;

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
