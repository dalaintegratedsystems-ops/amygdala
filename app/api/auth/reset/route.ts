import { env } from "cloudflare:workers";
import { getSessionSecret, hashPassword } from "../../../lib/auth.mjs";
import { emailProviderConfigured, sendEmail } from "../../../lib/email.mjs";
import { getStore } from "../../../lib/store.mjs";
import { actionLink, RESET_TTL_SECONDS, signActionToken, verifyActionToken } from "../../../lib/tokens.mjs";
import { isValidEmail, normaliseEmail, passwordPolicyError } from "../../../lib/users.mjs";

type RuntimeEnv = Record<string, unknown>;

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try { body = (await request.json()) as Record<string, unknown>; }
  catch { return Response.json({ error: "Invalid JSON body." }, { status: 400 }); }

  const action = String(body.action ?? "request");
  const store = getStore(env as unknown as RuntimeEnv);
  const secret = getSessionSecret(env as unknown as RuntimeEnv);

  if (action === "consume") {
    const token = String(body.token ?? "");
    const policy = passwordPolicyError(body.password);
    if (policy) return Response.json({ error: policy }, { status: 400 });
    const result = await verifyActionToken(token, secret, { purpose: "reset" });
    if (!result.valid) return Response.json({ error: "Reset link is invalid or expired.", reason: result.reason }, { status: 400 });
    const user = await store.findUserById(result.payload.sub);
    if (!user) return Response.json({ error: "Reset link is invalid or expired." }, { status: 400 });
    await store.setUserPassword(user.userId, await hashPassword(String(body.password)));
    await store.recordAudit({ organisationId: user.organisationId, actor: user.displayName, role: user.role, eventType: "user.password_reset", entityType: "user", entityId: user.userId, detail: user.email });
    return Response.json({ ok: true }, { headers: { "cache-control": "no-store" } });
  }

  const email = normaliseEmail(body.email);
  if (!isValidEmail(email)) return Response.json({ error: "A valid email is required." }, { status: 400 });
  const user = await store.findUserByEmail(email);
  // Always 200 so this endpoint does not reveal whether an account exists.
  let resetUrl: string | null = null;
  if (user) {
    const token = await signActionToken({ purpose: "reset", sub: user.userId, email: user.email, org: user.organisationId }, secret, { ttlSeconds: RESET_TTL_SECONDS });
    resetUrl = actionLink(new URL(request.url).origin, "/signin?reset=1", token);
    await sendEmail(env as unknown as RuntimeEnv, { to: user.email, subject: "Reset your Amygdala password", text: `Reset your password: ${resetUrl}` });
  }
  return Response.json({
    ok: true,
    emailed: emailProviderConfigured(env as unknown as RuntimeEnv),
    resetUrl: emailProviderConfigured(env as unknown as RuntimeEnv) ? null : resetUrl,
  }, { headers: { "cache-control": "no-store" } });
}
