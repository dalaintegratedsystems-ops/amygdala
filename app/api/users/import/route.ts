import { env } from "cloudflare:workers";
import { authorizeRequest } from "../../../lib/access.mjs";
import { getSessionSecret } from "../../../lib/auth.mjs";
import { previewImport } from "../../../lib/csv.mjs";
import { sendEmail } from "../../../lib/email.mjs";
import { getStore } from "../../../lib/store.mjs";
import { actionLink, INVITE_TTL_SECONDS, signActionToken } from "../../../lib/tokens.mjs";
import { publicUser, randomCredential, writeAudit } from "../../../lib/users.mjs";

type RuntimeEnv = Record<string, unknown>;

export async function POST(request: Request) {
  const decision = await authorizeRequest(request, "import-users", env as unknown as RuntimeEnv);
  if (!decision.allowed) return Response.json({ error: "CSV import requires the import-users capability.", reason: decision.reason }, { status: 403 });

  let body: Record<string, unknown>;
  try { body = (await request.json()) as Record<string, unknown>; }
  catch { return Response.json({ error: "Invalid JSON body." }, { status: 400 }); }

  const csv = typeof body.csv === "string" ? body.csv : "";
  if (!csv.trim()) return Response.json({ error: "A csv string is required." }, { status: 400 });

  const store = getStore(env as unknown as RuntimeEnv);
  const organisationId = decision.principal!.organisationId;
  const existing = await store.listUsers(organisationId);
  const customRoles = await store.listCustomRoles(organisationId);
  const preview = previewImport(csv, { existingEmails: existing.map((user: { email: string }) => user.email), customRoles });
  if (preview.error) return Response.json({ error: preview.error, preview }, { status: 400 });

  const dryRun = body.dryRun !== false;
  if (dryRun) return Response.json({ dryRun: true, preview }, { headers: { "cache-control": "no-store" } });

  const created = [];
  const origin = new URL(request.url).origin;
  const secret = getSessionSecret(env as unknown as RuntimeEnv);
  for (const row of preview.rows.filter((entry) => entry.ok)) {
    const userId = crypto.randomUUID();
    await store.createUser({ userId, email: row.email, displayName: row.displayName, organisationId, role: row.role, credential: await randomCredential(), status: row.status === "active" ? "invited" : row.status });
    const token = await signActionToken({ purpose: "invite", sub: userId, email: row.email, org: organisationId }, secret, { ttlSeconds: INVITE_TTL_SECONDS });
    const inviteUrl = actionLink(origin, "/signin?invite=1", token);
    await sendEmail(env as unknown as RuntimeEnv, { to: row.email, subject: "You’re invited to Amygdala", text: `Set your password: ${inviteUrl}` });
    created.push({ ...publicUser({ userId, email: row.email, displayName: row.displayName, organisationId, role: row.role, status: "invited" }), inviteUrl });
  }
  await writeAudit(store, decision.principal, { eventType: "user.imported", entityType: "user", entityId: organisationId, detail: `created=${created.length} errors=${preview.counts.errors}` });
  return Response.json({ dryRun: false, preview, created }, { status: 201, headers: { "cache-control": "no-store" } });
}
