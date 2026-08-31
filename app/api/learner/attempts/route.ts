import { env } from "cloudflare:workers";
import { resolveRequestIdentity } from "../../../lib/auth.mjs";
import { getStore } from "../../../lib/store.mjs";
import { calculateReadiness } from "../../../lib/domain.mjs";

type RuntimeEnv = Record<string, unknown>;

const KINDS = new Set(["simulation", "assessment", "vendor-simulation", "learning"]);

function clampScore(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

// Record a learner attempt (simulation / assessment / vendor simulation) and
// fold its score into the learner's per-course progress. Returns both so the
// UI reflects persisted state that survives reload.
export async function POST(request: Request) {
  const principal = await resolveRequestIdentity(request, env as unknown as RuntimeEnv);
  if (!principal) return Response.json({ error: "Sign in to record an attempt." }, { status: 401 });

  let body: Record<string, unknown>;
  try { body = (await request.json()) as Record<string, unknown>; }
  catch { return Response.json({ error: "Invalid JSON body." }, { status: 400 }); }

  const courseId = typeof body.courseId === "string" ? body.courseId : "";
  const kind = typeof body.kind === "string" && KINDS.has(body.kind) ? body.kind : "";
  if (!courseId || !kind) return Response.json({ error: "A courseId and a valid kind are required." }, { status: 400 });

  const score = clampScore(body.score);
  const store = getStore(env as unknown as RuntimeEnv);
  const organisationId = principal.organisationId;

  const attempt = await store.recordAttempt({
    organisationId,
    userId: principal.userId,
    courseId,
    kind,
    refId: typeof body.refId === "string" ? body.refId : "",
    score,
    detail: body.detail && typeof body.detail === "object" ? (body.detail as Record<string, unknown>) : {},
  });

  const existing = await store.getLearnerProgress(organisationId, principal.userId, courseId);
  const patch: Record<string, number | string> = {};
  if (kind === "simulation" || kind === "vendor-simulation") patch.simulationScore = score;
  else if (kind === "assessment") patch.assessmentScore = score;
  else if (kind === "learning") patch.learningScore = score;

  const learning = (patch.learningScore as number) ?? existing?.learningScore ?? 0;
  const simulation = (patch.simulationScore as number) ?? existing?.simulationScore ?? 0;
  const assessment = (patch.assessmentScore as number) ?? existing?.assessmentScore ?? 0;
  const readiness = calculateReadiness({ lessons: learning, simulation, assessment });
  patch.readiness = readiness;
  patch.status = readiness >= 80 ? "ready" : "in-progress";

  const progress = await store.upsertLearnerProgress(organisationId, principal.userId, courseId, patch);
  return Response.json({ attempt, progress }, { headers: { "cache-control": "no-store" } });
}

export async function GET(request: Request) {
  const principal = await resolveRequestIdentity(request, env as unknown as RuntimeEnv);
  if (!principal) return Response.json({ error: "Sign in to view your attempts." }, { status: 401 });
  const store = getStore(env as unknown as RuntimeEnv);
  const courseId = new URL(request.url).searchParams.get("courseId") ?? undefined;
  const attempts = await store.listAttempts(principal.organisationId, principal.userId, courseId);
  return Response.json({ attempts }, { headers: { "cache-control": "no-store" } });
}
