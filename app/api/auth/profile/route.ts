import { env } from "cloudflare:workers";
import { hashPassword, resolveRequestIdentity, verifyPassword } from "../../../lib/auth.mjs";
import { getStore } from "../../../lib/store.mjs";
import { passwordPolicyError, publicUser } from "../../../lib/users.mjs";

type RuntimeEnv = Record<string, unknown>;

export async function GET(request: Request) {
  const principal = await resolveRequestIdentity(request, env as unknown as RuntimeEnv);
  if (!principal) return Response.json({ error: "Sign in required." }, { status: 401 });
  const store = getStore(env as unknown as RuntimeEnv);
  const profile = await store.getUserProfile(principal.organisationId, principal.userId);
  return Response.json({ user: publicUser({ ...principal, status: profile.status, mfaEnabled: profile.mfaEnabled }) }, { headers: { "cache-control": "no-store" } });
}

export async function PATCH(request: Request) {
  const principal = await resolveRequestIdentity(request, env as unknown as RuntimeEnv);
  if (!principal) return Response.json({ error: "Sign in required." }, { status: 401 });

  let body: Record<string, unknown>;
  try { body = (await request.json()) as Record<string, unknown>; }
  catch { return Response.json({ error: "Invalid JSON body." }, { status: 400 }); }

  const store = getStore(env as unknown as RuntimeEnv);
  const organisationId = principal.organisationId;
  if (typeof body.displayName === "string" && body.displayName.trim()) {
    await store.updateUser(organisationId, principal.userId, { displayName: body.displayName.trim() });
  }
  if (body.password) {
    const current = await store.findUserById(principal.userId);
    if (!current || !(await verifyPassword(String(body.currentPassword ?? ""), current.credential))) {
      return Response.json({ error: "Current password is incorrect." }, { status: 400 });
    }
    const policy = passwordPolicyError(body.password);
    if (policy) return Response.json({ error: policy }, { status: 400 });
    await store.setUserPassword(principal.userId, await hashPassword(String(body.password)));
    await store.recordAudit({ organisationId, actor: principal.displayName, role: principal.role, eventType: "user.password_changed", entityType: "user", entityId: principal.userId, detail: "" });
  }
  const updated = await store.findUserById(principal.userId);
  const profile = await store.getUserProfile(organisationId, principal.userId);
  return Response.json({ user: publicUser({ ...updated, status: profile.status, mfaEnabled: profile.mfaEnabled }) }, { headers: { "cache-control": "no-store" } });
}
