import { sources } from "../../../lib/domain.mjs";
import { approveCourse, generateCourseFromSource, summariseGeneratedCourse } from "../../../lib/authoring.mjs";
import { authorizeIdentity } from "../../../lib/security.mjs";

export async function POST(request: Request) {
  const token = request.headers.get("x-identity-token") ?? "";
  const decision = authorizeIdentity(token, "generate-course");
  if (!decision.allowed) return Response.json({ error: "Course authoring requires an approved administrator role.", reason: decision.reason }, { status: 403 });

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const sourceId = typeof body.sourceId === "string" ? body.sourceId : "";
  const source = sources.find((item: { id: string }) => item.id === sourceId);
  if (!source) return Response.json({ error: "Unknown source." }, { status: 404 });

  const generated = generateCourseFromSource(source, { generatedAt: new Date().toISOString() });
  if (!generated.ok) return Response.json({ error: generated.message, reason: generated.reason }, { status: 422 });

  const course = body.approve === true ? approveCourse(generated) : generated;
  console.log(JSON.stringify({ event: "course_generated", actor: decision.identity?.userId, sourceId, approved: body.approve === true, timestamp: new Date().toISOString() }));
  return Response.json({ course, summary: summariseGeneratedCourse(course) }, { headers: { "cache-control": "no-store" } });
}
