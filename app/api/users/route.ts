import { env } from "cloudflare:workers";
import { authorizeRequest } from "../../lib/access.mjs";
import { hashPassword, getSessionSecret } from "../../lib/auth.mjs";
import { sendEmail } from "../../lib/email.mjs";
import { getStore } from "../../lib/store.mjs";
import { actionLink, INVITE_TTL_SECONDS, signActionToken } from "../../lib/tokens.mjs";
import { assignableRoles, isKnownRole, isValidEmail, normaliseEmail, passwordPolicyError, publicUser, randomCredential, writeAudit } from "../../lib/users.mjs";

type RuntimeEnv = Record<string, unknown>;

function originOf(request: Request) {
  return new URL(request.url).origin;
}

export async function GET(request: Request) {
  const decision = await authorizeRequest(request, "manage-users", env as unknown as RuntimeEnv);
  if (!decision.allowed) return Response.json({ error: "User management requires the manage-users capability.", reason: decision.reason }, { status: 403 });
  const store = getStore(env as unknown as RuntimeEnv);
  const organisationId = decision.principal!.organisationId;
  const query = new URL(request.url).searchParams.get("q")?.trim().toLowerCase() ?? "";
  let users = await store.listUsers(organisationId);
  if (query) users = users.filter((user: { email: string; displayName: string; role: string }) => `${user.email} ${user.displayName} ${user.role}`.toLowerCase().includes(query));
  const roles = await assignableRoles(store, organisationId);
  return Response.json({ users: users.map(publicUser), roles }, { headers: { "cache-control": "no-store" } });
}

export async function POST(request: Request) {
  const decision = await authorizeRequest(request, "manage-users", env as unknown as RuntimeEnv);
  if (!decision.allowed) return Response.json({ error: "User management requires the manage-users capability.", reason: decision.reason }, { status: 403 });

  let body: Record<string, unknown>;
  try { body = (await request.json()) as Record<string, unknown>; }
  catch { return Response.json({ error: "Invalid JSON body." }, { status: 400 }); }

  const email = normaliseEmail(body.email);
  const displayName = String(body.displayName ?? "").trim();
  const role = String(body.role ?? "Learner").trim() || "Learner";
  if (!isValidEmail(email)) return Response.json({ error: "A valid email is required." }, { status: 400 });
  if (!displayName) return Response.json({ error: "A display name is required." }, { status: 400 });

  const store = getStore(env as unknown as RuntimeEnv);
  const organisationId = decision.principal!.organisationId;
  if (!isKnownRole(role, (await store.listCustomRoles(organisationId)).map((entry: { name: string }) => entry.name))) {
    return Response.json({ error: "Unknown role." }, { status: 400 });
  }
  if (await store.findUserByEmail(email)) return Response.json({ error: "A user with that email already exists." }, { status: 409 });

  const invite = body.invite !== false && !body.password;
  let credential;
  if (invite) credential = await randomCredential();
  else {
    const policy = passwordPolicyError(body.password);
    if (policy) return Response.json({ error: policy }, { status: 400 });
    credential = await hashPassword(String(body.password));
  }

  const userId = crypto.randomUUID();
  await store.createUser({ userId, email, displayName, organisationId, role, credential, status: invite ? "invited" : "active" });
  const created = (await store.listUsers(organisationId)).find((user: { userId: string }) => user.userId === userId);

  let inviteUrl: string | null = null;
  if (invite) {
    const token = await signActionToken({ purpose: "invite", sub: userId, email, org: organisationId }, getSessionSecret(env as unknown as RuntimeEnv), { ttlSeconds: INVITE_TTL_SECONDS });
    inviteUrl = actionLink(originOf(request), "/signin?invite=1", token);
    await sendEmail(env as unknown as RuntimeEnv, { to: email, subject: "You’re invited to Amygdala", text: `Set your password: ${inviteUrl}` });
  }

  await writeAudit(store, decision.principal, { eventType: invite ? "user.invited" : "user.created", entityType: "user", entityId: userId, detail: `${email} role=${role}` });
  return Response.json({ user: publicUser(created), inviteUrl }, { status: 201, headers: { "cache-control": "no-store" } });
}

export async function PATCH(request: Request) {
  const decision = await authorizeRequest(request, "manage-users", env as unknown as RuntimeEnv);
  if (!decision.allowed) return Response.json({ error: "User management requires the manage-users capability.", reason: decision.reason }, { status: 403 });

  let body: Record<string, unknown>;
  try { body = (await request.json()) as Record<string, unknown>; }
  catch { return Response.json({ error: "Invalid JSON body." }, { status: 400 }); }

  const userId = String(body.userId ?? body.id ?? "");
  if (!userId) return Response.json({ error: "A userId is required." }, { status: 400 });

  const store = getStore(env as unknown as RuntimeEnv);
  const organisationId = decision.principal!.organisationId;
  const existing = await store.findUserById(userId);
  if (!existing || existing.organisationId !== organisationId) return Response.json({ error: "Unknown user." }, { status: 404 });

  const patch: Record<string, string> = {};
  if (typeof body.displayName === "string" && body.displayName.trim()) patch.displayName = body.displayName.trim();
  if (typeof body.role === "string" && body.role.trim()) {
    if (!(decision.principal!.userId === userId) && body.role !== existing.role) {
      const canAssign = await authorizeRequest(request, "assign-roles", env as unknown as RuntimeEnv);
      if (!canAssign.allowed) return Response.json({ error: "Assigning roles requires the assign-roles capability.", reason: canAssign.reason }, { status: 403 });
    }
    const custom = (await store.listCustomRoles(organisationId)).map((entry: { name: string }) => entry.name);
    if (!isKnownRole(body.role.trim(), custom)) return Response.json({ error: "Unknown role." }, { status: 400 });
    patch.role = body.role.trim();
  }
  const updated = Object.keys(patch).length ? await store.updateUser(organisationId, userId, patch) : { ...existing, status: (await store.getUserProfile(organisationId, userId)).status };

  if (typeof body.status === "string") {
    const status = body.status.trim();
    if (!["active", "suspended", "deactivated", "invited"].includes(status)) return Response.json({ error: "Unknown status." }, { status: 400 });
    await store.upsertUserProfile(organisationId, userId, { status });
    updated.status = status;
  }

  if (patch.role && patch.role !== existing.role) {
    await writeAudit(store, decision.principal, { eventType: "user.role_changed", entityType: "user", entityId: userId, detail: `${existing.role} → ${patch.role}` });
  }
  if (typeof body.status === "string") {
    await writeAudit(store, decision.principal, { eventType: `user.${body.status}`, entityType: "user", entityId: userId, detail: String(body.status) });
  }
  return Response.json({ user: publicUser(updated) }, { headers: { "cache-control": "no-store" } });
}
