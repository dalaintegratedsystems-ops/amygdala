import { env } from "cloudflare:workers";
import { buildSessionCookie, createSession, getSessionSecret, hashPassword } from "../../../lib/auth.mjs";
import { domainAllowed } from "../../../lib/provisioning.mjs";
import { ensureBootstrap } from "../../../lib/store.mjs";
import { isValidEmail, normaliseEmail, passwordPolicyError, publicUser } from "../../../lib/users.mjs";

type RuntimeEnv = Record<string, unknown>;

export async function POST(request: Request) {
  const store = await ensureBootstrap(env as unknown as RuntimeEnv);
  let body: Record<string, unknown>;
  try { body = (await request.json()) as Record<string, unknown>; }
  catch { return Response.json({ error: "Invalid JSON body." }, { status: 400 }); }

  const email = normaliseEmail(body.email);
  const displayName = String(body.displayName ?? "").trim();
  const policy = passwordPolicyError(body.password);
  if (!isValidEmail(email)) return Response.json({ error: "A valid email is required." }, { status: 400 });
  if (!displayName) return Response.json({ error: "A display name is required." }, { status: 400 });
  if (policy) return Response.json({ error: policy }, { status: 400 });
  if (await store.findUserByEmail(email)) return Response.json({ error: "An account with that email already exists." }, { status: 409 });

  // Domain-allowed self-signup joins the primary workspace when the domain is
  // on that workspace's allow-list. No matching domain → signup stays closed.
  const organisationId = "org-primary";
  const config = await store.getProvisioningConfig(organisationId);
  if (!domainAllowed(email, config.allowedDomains)) {
    return Response.json({ error: "Self-signup is not enabled for that email domain.", seam: true }, { status: 403 });
  }

  const userId = crypto.randomUUID();
  const role = config.defaultRole || "Learner";
  await store.createUser({ userId, email, displayName, organisationId, role, credential: await hashPassword(String(body.password)), status: "active" });
  await store.recordAudit({ organisationId, actor: displayName, role, eventType: "user.signup", entityType: "user", entityId: userId, detail: email });

  const principal = { userId, email, displayName, role, organisationId };
  const token = await createSession(principal, getSessionSecret(env as unknown as RuntimeEnv));
  const secure = new URL(request.url).protocol === "https:";
  return new Response(JSON.stringify({ user: publicUser({ ...principal, status: "active" }) }), {
    status: 201,
    headers: { "content-type": "application/json", "cache-control": "no-store", "set-cookie": buildSessionCookie(token, { secure }) },
  });
}
