import { env } from "cloudflare:workers";
import { getSessionSecret, resolveRequestIdentity } from "../../../lib/auth.mjs";
import { decorateCredential } from "../../../lib/credentials.mjs";
import { getStore } from "../../../lib/store.mjs";
import { calculateReadiness } from "../../../lib/domain.mjs";

type RuntimeEnv = Record<string, unknown>;

// Read the signed-in learner's issued readiness credentials (one course via
// ?courseId=, or all).
export async function GET(request: Request) {
  const principal = await resolveRequestIdentity(request, env as unknown as RuntimeEnv);
  if (!principal) return Response.json({ error: "Sign in to view your credentials." }, { status: 401 });
  const store = getStore(env as unknown as RuntimeEnv);
  const courseId = new URL(request.url).searchParams.get("courseId");
  const secret = getSessionSecret(env as unknown as RuntimeEnv);
  if (courseId) {
    const credential = await store.getCredential(principal.organisationId, principal.userId, courseId);
    return Response.json({ credential: credential ? await decorateCredential(credential, secret) : null }, { headers: { "cache-control": "no-store" } });
  }
  const credentials = await store.listCredentials(principal.organisationId, principal.userId);
  const decorated = await Promise.all(credentials.map((cred: Record<string, unknown>) => decorateCredential(cred, secret)));
  return Response.json({ credentials: decorated }, { headers: { "cache-control": "no-store" } });
}

// Issue (or refresh) a readiness credential for a completed course. The
// readiness is recomputed from the learner's persisted component scores so the
// credential is always consistent with the stored progress.
export async function POST(request: Request) {
  const principal = await resolveRequestIdentity(request, env as unknown as RuntimeEnv);
  if (!principal) return Response.json({ error: "Sign in to claim a credential." }, { status: 401 });

  let body: Record<string, unknown>;
  try { body = (await request.json()) as Record<string, unknown>; }
  catch { return Response.json({ error: "Invalid JSON body." }, { status: 400 }); }

  const courseId = typeof body.courseId === "string" ? body.courseId : "";
  if (!courseId) return Response.json({ error: "A courseId is required." }, { status: 400 });

  const store = getStore(env as unknown as RuntimeEnv);
  const organisationId = principal.organisationId;
  const course = await store.getCourse(organisationId, courseId);
  if (!course) return Response.json({ error: "Unknown course." }, { status: 404 });

  const progress = await store.getLearnerProgress(organisationId, principal.userId, courseId);
  const breakdown = {
    learning: progress?.learningScore ?? 0,
    simulation: progress?.simulationScore ?? 0,
    assessment: progress?.assessmentScore ?? 0,
  };
  const readiness = calculateReadiness({ lessons: breakdown.learning, simulation: breakdown.simulation, assessment: breakdown.assessment });

  const credential = await store.issueCredential({
    organisationId,
    userId: principal.userId,
    courseId,
    learner: principal.displayName,
    programme: course.title,
    readiness,
    breakdown,
  });
  await store.recordAudit({ organisationId, actor: principal.displayName, role: principal.role, eventType: "credential.issued", entityType: "credential", entityId: courseId, detail: `readiness=${readiness}` });
  return Response.json({ credential: await decorateCredential(credential, getSessionSecret(env as unknown as RuntimeEnv)) }, { status: 201, headers: { "cache-control": "no-store" } });
}
