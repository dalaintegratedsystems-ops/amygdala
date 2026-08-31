import { env } from "cloudflare:workers";
import { authorizeRequest } from "../../lib/access.mjs";
import { resolveRequestIdentity } from "../../lib/auth.mjs";
import { sendEmail } from "../../lib/email.mjs";
import { getStore } from "../../lib/store.mjs";
import { writeAudit } from "../../lib/users.mjs";

type RuntimeEnv = Record<string, unknown>;

export async function GET(request: Request) {
  const principal = await resolveRequestIdentity(request, env as unknown as RuntimeEnv);
  if (!principal) return Response.json({ error: "Sign in required." }, { status: 401 });
  const store = getStore(env as unknown as RuntimeEnv);
  const notifications = await store.listNotifications(principal.organisationId, principal.userId);
  return Response.json({ notifications }, { headers: { "cache-control": "no-store" } });
}

export async function PATCH(request: Request) {
  const principal = await resolveRequestIdentity(request, env as unknown as RuntimeEnv);
  if (!principal) return Response.json({ error: "Sign in required." }, { status: 401 });
  let body: Record<string, unknown>;
  try { body = (await request.json()) as Record<string, unknown>; }
  catch { return Response.json({ error: "Invalid JSON body." }, { status: 400 }); }
  const id = String(body.id ?? "");
  if (!id) return Response.json({ error: "A notification id is required." }, { status: 400 });
  const store = getStore(env as unknown as RuntimeEnv);
  await store.markNotificationRead(principal.organisationId, id, principal.userId);
  return Response.json({ ok: true }, { headers: { "cache-control": "no-store" } });
}

export async function POST(request: Request) {
  const decision = await authorizeRequest(request, "send-nudge", env as unknown as RuntimeEnv);
  if (!decision.allowed) return Response.json({ error: "Sending nudges requires the send-nudge capability.", reason: decision.reason }, { status: 403 });
  let body: Record<string, unknown>;
  try { body = (await request.json()) as Record<string, unknown>; }
  catch { return Response.json({ error: "Invalid JSON body." }, { status: 400 }); }
  const userId = String(body.userId ?? "");
  if (!userId) return Response.json({ error: "A userId is required." }, { status: 400 });
  const store = getStore(env as unknown as RuntimeEnv);
  const organisationId = decision.principal!.organisationId;
  const target = await store.findUserById(userId);
  if (!target || target.organisationId !== organisationId) return Response.json({ error: "Unknown user." }, { status: 404 });
  const title = String(body.title ?? "Training reminder");
  const bodyText = String(body.body ?? "Please complete your assigned training.");
  const notification = await store.createNotification(organisationId, { userId, kind: "nudge", title, body: bodyText });
  await sendEmail(env as unknown as RuntimeEnv, { to: target.email, subject: title, text: bodyText });
  await writeAudit(store, decision.principal, { eventType: "nudge.sent", entityType: "user", entityId: userId, detail: title });
  return Response.json({ notification }, { status: 201, headers: { "cache-control": "no-store" } });
}
