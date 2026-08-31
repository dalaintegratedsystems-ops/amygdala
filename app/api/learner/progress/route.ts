import { env } from "cloudflare:workers";
import { resolveRequestIdentity } from "../../../lib/auth.mjs";
import { getStore } from "../../../lib/store.mjs";
import { calculateReadiness } from "../../../lib/domain.mjs";

type RuntimeEnv = Record<string, unknown>;

function clampScore(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return Math.max(0, Math.min(100, Math.round(value)));
}

// The signed-in user is the learner. Read their per-course progress (one course
// via ?courseId=, or all courses). Progress survives reload.
export async function GET(request: Request) {
  const principal = await resolveRequestIdentity(request, env as unknown as RuntimeEnv);
  if (!principal) return Response.json({ error: "Sign in to view your progress." }, { status: 401 });
  const store = getStore(env as unknown as RuntimeEnv);
  const courseId = new URL(request.url).searchParams.get("courseId");
  if (courseId) {
    const progress = await store.getLearnerProgress(principal.organisationId, principal.userId, courseId);
    return Response.json({ progress }, { headers: { "cache-control": "no-store" } });
  }
  const progress = await store.listLearnerProgress(principal.organisationId, principal.userId);
  return Response.json({ progress }, { headers: { "cache-control": "no-store" } });
}

// Upsert the learner's component scores for a course. Readiness is always
// recomputed server-side from the fixed formula so the client can never write
// an inconsistent value.
export async function POST(request: Request) {
  const principal = await resolveRequestIdentity(request, env as unknown as RuntimeEnv);
  if (!principal) return Response.json({ error: "Sign in to save your progress." }, { status: 401 });

  let body: Record<string, unknown>;
  try { body = (await request.json()) as Record<string, unknown>; }
  catch { return Response.json({ error: "Invalid JSON body." }, { status: 400 }); }

  const courseId = typeof body.courseId === "string" ? body.courseId : "";
  if (!courseId) return Response.json({ error: "A courseId is required." }, { status: 400 });

  const store = getStore(env as unknown as RuntimeEnv);
  const existing = await store.getLearnerProgress(principal.organisationId, principal.userId, courseId);
  const patch: Record<string, number | string> = {};
  const learning = clampScore(body.learningScore);
  const simulation = clampScore(body.simulationScore);
  const assessment = clampScore(body.assessmentScore);
  if (learning !== undefined) patch.learningScore = learning;
  if (simulation !== undefined) patch.simulationScore = simulation;
  if (assessment !== undefined) patch.assessmentScore = assessment;

  const readiness = calculateReadiness({
    lessons: learning ?? existing?.learningScore ?? 0,
    simulation: simulation ?? existing?.simulationScore ?? 0,
    assessment: assessment ?? existing?.assessmentScore ?? 0,
  });
  patch.readiness = readiness;
  patch.status = readiness >= 80 ? "ready" : "in-progress";

  const progress = await store.upsertLearnerProgress(principal.organisationId, principal.userId, courseId, patch);
  return Response.json({ progress }, { headers: { "cache-control": "no-store" } });
}
