import { env } from "cloudflare:workers";
import { sources } from "../../../lib/domain.mjs";
import { approveCourse, summariseGeneratedCourse } from "../../../lib/authoring.mjs";
import { generateCourseFromSourceAI } from "../../../lib/ai.mjs";
import { authorizeRequest } from "../../../lib/auth.mjs";

export async function POST(request: Request) {
  const decision = await authorizeRequest(request, "generate-course", env as unknown as Record<string, unknown>);
  if (!decision.allowed) return Response.json({ error: "Course authoring requires an approved administrator role.", reason: decision.reason }, { status: 403 });

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  // Accept either a seeded sourceId or an inline (uploaded + extracted) source.
  const inlineSource = body.source && typeof body.source === "object" ? (body.source as { id?: string }) : null;
  const sourceId = typeof body.sourceId === "string" ? body.sourceId : "";
  const source = inlineSource ?? sources.find((item: { id: string }) => item.id === sourceId);
  if (!source) return Response.json({ error: "Unknown source." }, { status: 404 });

  const generated = await generateCourseFromSourceAI(env as unknown as Record<string, unknown>, source, { generatedAt: new Date().toISOString() });
  if (!generated.ok) return Response.json({ error: generated.message, reason: generated.reason }, { status: 422 });

  const course = body.approve === true ? approveCourse(generated) : generated;
  console.log(JSON.stringify({ event: "course_generated", actor: decision.principal?.userId, sourceId: (source as { id?: string }).id, approved: body.approve === true, timestamp: new Date().toISOString() }));
  return Response.json({ course, summary: summariseGeneratedCourse(course) }, { headers: { "cache-control": "no-store" } });
}
