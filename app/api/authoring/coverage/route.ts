import { env } from "cloudflare:workers";
import { assessCourseCoverage } from "../../../lib/coverage.mjs";
import { authorizeRequest } from "../../../lib/auth.mjs";
import { getStore } from "../../../lib/store.mjs";

// Per-course grounding & coverage check for the author: how much of the source
// the course teaches, which generated claims look unsupported, and a per-item
// confidence score. Read-only review aid — nothing is persisted or blocked.
export async function POST(request: Request) {
  const decision = await authorizeRequest(request, "generate-course", env as unknown as Record<string, unknown>);
  if (!decision.allowed) return Response.json({ error: "Course authoring requires an approved administrator role.", reason: decision.reason }, { status: 403 });

  let body: Record<string, unknown>;
  try { body = (await request.json()) as Record<string, unknown>; }
  catch { return Response.json({ error: "Invalid JSON body." }, { status: 400 }); }

  const store = getStore(env as unknown as Record<string, unknown>);
  const organisationId = decision.principal?.organisationId;

  const sourceId = typeof body.sourceId === "string" ? body.sourceId : "";
  const source = body.source && typeof body.source === "object" ? (body.source as Record<string, unknown>) : (sourceId ? await store.getSource(organisationId, sourceId) : null);
  if (!source) return Response.json({ error: "Unknown source." }, { status: 404 });

  // Accept an inline (edited) course, or resolve the persisted one by id/source.
  const courseId = typeof body.courseId === "string" ? body.courseId : "";
  const inlineCourse = body.course && typeof body.course === "object" ? (body.course as Record<string, unknown>) : null;
  let course = inlineCourse;
  if (!course && courseId) course = (await store.getCourse(organisationId, courseId))?.course ?? null;
  if (!course && sourceId) course = (await store.findCourseBySource(organisationId, sourceId))?.course ?? null;
  if (!course) return Response.json({ error: "Unknown course." }, { status: 404 });

  const report = assessCourseCoverage(source, course);
  return Response.json({ report }, { headers: { "cache-control": "no-store" } });
}
