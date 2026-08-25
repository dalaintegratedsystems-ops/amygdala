import { env } from "cloudflare:workers";
import { issueCredential } from "../../../lib/governance.mjs";
import { authorizeRequest } from "../../../lib/auth.mjs";

export async function POST(request: Request) {
  const decision = await authorizeRequest(request, "issue-credential", env as unknown as Record<string, unknown>);
  if (!decision.allowed) return Response.json({ error: "Issuing a credential requires the issue-credential capability.", reason: decision.reason }, { status: 403 });

  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }

  const credential = issueCredential(
    {
      learner: typeof body.learner === "string" ? body.learner : "Aisha Naidoo",
      organisation: typeof body.organisation === "string" ? body.organisation : "Aurora Creative",
      readiness: typeof body.readiness === "number" ? body.readiness : 91,
      breakdown: (body.breakdown as Record<string, number>) ?? undefined,
    },
    { issuedAt: new Date().toISOString() },
  );
  console.log(JSON.stringify({ event: "credential_issued", actor: decision.principal?.userId, code: credential.credentialSubject.credentialCode, timestamp: new Date().toISOString() }));
  return Response.json({ credential }, { headers: { "cache-control": "no-store" } });
}
