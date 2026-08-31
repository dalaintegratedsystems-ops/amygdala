import { env } from "cloudflare:workers";
import { resolveRequestIdentity } from "../../../lib/auth.mjs";
import { getStore } from "../../../lib/store.mjs";
import { generateTotpSecret, totpUri, verifyTotp } from "../../../lib/totp.mjs";

type RuntimeEnv = Record<string, unknown>;

async function requireUser(request: Request) {
  const principal = await resolveRequestIdentity(request, env as unknown as RuntimeEnv);
  if (!principal) return { error: Response.json({ error: "Sign in required." }, { status: 401 }) };
  return { principal, store: getStore(env as unknown as RuntimeEnv) };
}

export async function GET(request: Request) {
  const loaded = await requireUser(request);
  if (loaded.error) return loaded.error;
  const profile = await loaded.store.getUserProfile(loaded.principal.organisationId, loaded.principal.userId);
  return Response.json({ mfaEnabled: Boolean(profile.mfaEnabled) }, { headers: { "cache-control": "no-store" } });
}

export async function POST(request: Request) {
  const loaded = await requireUser(request);
  if (loaded.error) return loaded.error;

  let body: Record<string, unknown>;
  try { body = (await request.json()) as Record<string, unknown>; }
  catch { return Response.json({ error: "Invalid JSON body." }, { status: 400 }); }

  const action = String(body.action ?? "start");
  const organisationId = loaded.principal.organisationId;
  const userId = loaded.principal.userId;

  if (action === "start") {
    const secret = generateTotpSecret();
    await loaded.store.upsertUserProfile(organisationId, userId, { mfaSecret: secret, mfaEnabled: 0 });
    return Response.json({ secret, uri: totpUri({ secret, account: loaded.principal.email }) }, { headers: { "cache-control": "no-store" } });
  }

  if (action === "confirm") {
    const profile = await loaded.store.getUserProfile(organisationId, userId);
    if (!profile.mfaSecret) return Response.json({ error: "Start MFA enrolment first." }, { status: 400 });
    if (!(await verifyTotp(profile.mfaSecret, String(body.code ?? "")))) return Response.json({ error: "Invalid authenticator code." }, { status: 400 });
    await loaded.store.upsertUserProfile(organisationId, userId, { mfaEnabled: 1, mfaSecret: profile.mfaSecret });
    await loaded.store.recordAudit({ organisationId, actor: loaded.principal.displayName, role: loaded.principal.role, eventType: "user.mfa_enabled", entityType: "user", entityId: userId, detail: "" });
    return Response.json({ mfaEnabled: true }, { headers: { "cache-control": "no-store" } });
  }

  if (action === "disable") {
    const profile = await loaded.store.getUserProfile(organisationId, userId);
    if (profile.mfaEnabled && !(await verifyTotp(profile.mfaSecret, String(body.code ?? "")))) {
      return Response.json({ error: "Invalid authenticator code." }, { status: 400 });
    }
    await loaded.store.upsertUserProfile(organisationId, userId, { mfaEnabled: 0, mfaSecret: "" });
    await loaded.store.recordAudit({ organisationId, actor: loaded.principal.displayName, role: loaded.principal.role, eventType: "user.mfa_disabled", entityType: "user", entityId: userId, detail: "" });
    return Response.json({ mfaEnabled: false }, { headers: { "cache-control": "no-store" } });
  }

  return Response.json({ error: "Unknown MFA action." }, { status: 400 });
}
