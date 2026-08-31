import { env } from "cloudflare:workers";
import { buildSessionCookie, createSession, getSessionSecret, hashPassword } from "../../../lib/auth.mjs";
import { getStore } from "../../../lib/store.mjs";
import { verifyActionToken } from "../../../lib/tokens.mjs";
import { passwordPolicyError, publicUser } from "../../../lib/users.mjs";

type RuntimeEnv = Record<string, unknown>;

async function loadInvite(token: string) {
  const result = await verifyActionToken(token, getSessionSecret(env as unknown as RuntimeEnv), { purpose: "invite" });
  if (!result.valid) return { error: "Invite link is invalid or expired.", reason: result.reason };
  const store = getStore(env as unknown as RuntimeEnv);
  const user = await store.findUserById(result.payload.sub);
  if (!user || user.organisationId !== result.payload.org) return { error: "Invite link is invalid or expired.", reason: "unknown-user" };
  return { store, user, payload: result.payload };
}

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token") ?? "";
  const loaded = await loadInvite(token);
  if (!("user" in loaded) || !loaded.user) return Response.json({ error: loaded.error, reason: loaded.reason }, { status: 400 });
  return Response.json({ email: loaded.user.email, displayName: loaded.user.displayName }, { headers: { "cache-control": "no-store" } });
}

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try { body = (await request.json()) as Record<string, unknown>; }
  catch { return Response.json({ error: "Invalid JSON body." }, { status: 400 }); }
  const token = String(body.token ?? "");
  const policy = passwordPolicyError(body.password);
  if (policy) return Response.json({ error: policy }, { status: 400 });

  const loaded = await loadInvite(token);
  if (!("user" in loaded) || !loaded.user) return Response.json({ error: loaded.error, reason: loaded.reason }, { status: 400 });

  const credential = await hashPassword(String(body.password));
  await loaded.store.setUserPassword(loaded.user.userId, credential);
  await loaded.store.upsertUserProfile(loaded.user.organisationId, loaded.user.userId, { status: "active" });
  await loaded.store.recordAudit({ organisationId: loaded.user.organisationId, actor: loaded.user.displayName, role: loaded.user.role, eventType: "user.invite_accepted", entityType: "user", entityId: loaded.user.userId, detail: loaded.user.email });

  const principal = { userId: loaded.user.userId, email: loaded.user.email, displayName: loaded.user.displayName, role: loaded.user.role, organisationId: loaded.user.organisationId };
  const session = await createSession(principal, getSessionSecret(env as unknown as RuntimeEnv));
  const secure = new URL(request.url).protocol === "https:";
  return new Response(JSON.stringify({ user: publicUser({ ...principal, status: "active" }) }), {
    status: 200,
    headers: { "content-type": "application/json", "cache-control": "no-store", "set-cookie": buildSessionCookie(session, { secure }) },
  });
}
