import { buildXapiStatements, competencyModels, defaultCompetencyModel, learnerByName } from "../../../lib/analytics.mjs";
import { authorizeIdentity } from "../../../lib/security.mjs";

export async function GET(request: Request) {
  const token = request.headers.get("x-identity-token") ?? "";
  const decision = authorizeIdentity(token, "view-analytics");
  if (!decision.allowed) return Response.json({ error: "xAPI export requires the view-analytics capability.", reason: decision.reason }, { status: 403 });

  const url = new URL(request.url);
  const learner = learnerByName(url.searchParams.get("learner") ?? "Aisha Naidoo");
  const model = competencyModels.find((item: { id: string }) => item.id === url.searchParams.get("model")) ?? defaultCompetencyModel;
  return Response.json({ actor: learner.learner, model: model.id, statements: buildXapiStatements(learner, model) }, { headers: { "cache-control": "no-store" } });
}
