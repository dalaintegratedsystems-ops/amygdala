import { env } from "cloudflare:workers";
import { scimNotLive } from "../../../lib/provisioning.mjs";
import { getStore } from "../../../lib/store.mjs";
import { hashPassword } from "../../../lib/auth.mjs";
import { mapGroupToRole } from "../../../lib/provisioning.mjs";
import { isValidEmail, normaliseEmail, randomCredential } from "../../../lib/users.mjs";

type RuntimeEnv = Record<string, unknown>;

async function tokenHash(token: string) {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)));
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function authorizeScim(request: Request) {
  const header = request.headers.get("authorization") ?? "";
  const token = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
  if (!token) return { ok: false as const };
  const store = getStore(env as unknown as RuntimeEnv);
  const organisationId = "org-primary";
  const config = await store.getProvisioningConfig(organisationId);
  if (!config.scimEnabled || !config.scimTokenHash) return { ok: false as const, config };
  const hash = await tokenHash(token);
  if (hash !== config.scimTokenHash) return { ok: false as const, config };
  return { ok: true as const, store, config, organisationId };
}

// SCIM 2.0 Users seam. Without a configured IdP token this stays 501 and
// clearly flagged. With a matching bearer token it provisions for real.
export async function GET() {
  return Response.json(scimNotLive({ detail: "SCIM 2.0 Users is a seam. Connect an IdP and set a SCIM token under Provisioning." }), { status: 501 });
}

export async function POST(request: Request) {
  const auth = await authorizeScim(request);
  if (!auth.ok) {
    return Response.json(scimNotLive(), { status: 501 });
  }
  let body: Record<string, unknown>;
  try { body = (await request.json()) as Record<string, unknown>; }
  catch { return Response.json(scimNotLive({ detail: "Invalid SCIM payload." }), { status: 400 }); }

  const emails = Array.isArray(body.emails) ? body.emails as Array<{ value?: string }> : [];
  const email = normaliseEmail((emails[0]?.value as string) ?? (body.userName as string) ?? "");
  const displayName = String(body.displayName ?? body.userName ?? email);
  if (!isValidEmail(email)) return Response.json({ schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"], status: "400", detail: "A valid userName/email is required." }, { status: 400 });
  if (await auth.store.findUserByEmail(email)) {
    return Response.json({ schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"], status: "409", detail: "User already exists." }, { status: 409 });
  }
  const groups = Array.isArray(body.groups) ? (body.groups as Array<{ display?: string; value?: string }>).map((group) => group.display ?? group.value ?? "") : [];
  const role = mapGroupToRole(groups, auth.config);
  const userId = crypto.randomUUID();
  await auth.store.createUser({ userId, email, displayName, organisationId: auth.organisationId, role, credential: body.password ? await hashPassword(String(body.password)) : await randomCredential(), status: "active" });
  await auth.store.recordAudit({ organisationId: auth.organisationId, actor: "scim", role: "SCIM", eventType: "user.scim_provisioned", entityType: "user", entityId: userId, detail: email });
  return Response.json({
    schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
    id: userId,
    userName: email,
    displayName,
    active: true,
    emails: [{ value: email, primary: true }],
  }, { status: 201 });
}
