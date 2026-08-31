import { env } from "cloudflare:workers";
import { authorizeRequest } from "../../lib/access.mjs";
import { getStore } from "../../lib/store.mjs";

// Real command-centre overview: counts + recent activity for the tenant.
// Everything is derived from persisted data, so a fresh workspace reports
// zeroes and empty lists (no fabricated metrics).
export async function GET(request: Request) {
  const decision = await authorizeRequest(request, "view-admin", env as unknown as Record<string, unknown>);
  if (!decision.allowed) return Response.json({ error: "Administrator access required.", reason: decision.reason }, { status: 403 });

  const store = getStore(env as unknown as Record<string, unknown>);
  const organisationId = decision.principal?.organisationId;
  const [sources, courses, audit] = await Promise.all([
    store.listSources(organisationId),
    store.listCourses(organisationId),
    store.listAudit(organisationId),
  ]);

  const aiActivity = audit
    .filter((event: { eventType: string }) => event.eventType === "ai.answer")
    .slice(0, 20)
    .map((event: { detail: string; actor?: string; createdAt: string }) => {
      let parsed: { status?: string; topic?: string; question?: string; source?: string } = {};
      try { parsed = JSON.parse(event.detail); } catch { parsed = {}; }
      return { question: parsed.question ?? parsed.topic ?? "Question", status: parsed.status ?? "Not covered", source: parsed.source ?? "No approved source", actor: event.actor ?? "Learner", createdAt: event.createdAt };
    });

  return Response.json({
    counts: {
      sources: sources.length,
      publishedSources: sources.filter((source: { status: string; approvalStatus: string }) => source.status === "Published" && source.approvalStatus === "Approved").length,
      readyForReview: sources.filter((source: { status: string }) => source.status === "Ready for review").length,
      courses: courses.length,
      publishedCourses: courses.filter((course: { status: string }) => course.status === "Published").length,
      auditEvents: audit.length,
    },
    aiActivity,
    recentAudit: audit.slice(0, 12),
  }, { headers: { "cache-control": "no-store" } });
}
