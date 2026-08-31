import { env } from "cloudflare:workers";
import { authorizeRequest } from "../../lib/access.mjs";
import { resolveRequestIdentity } from "../../lib/auth.mjs";
import { getStore } from "../../lib/store.mjs";

const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

function cleanColor(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (trimmed === "") return "";
  return HEX.test(trimmed) ? trimmed : undefined;
}

// Read the workspace brand kit. Any signed-in user (including learners) can
// read it so branding applies everywhere.
export async function GET(request: Request) {
  const principal = await resolveRequestIdentity(request, env as unknown as Record<string, unknown>);
  if (!principal) return Response.json({ error: "Sign in to load branding." }, { status: 401 });
  const store = getStore(env as unknown as Record<string, unknown>);
  const brand = await store.getBrand(principal.organisationId);
  return Response.json({ brand }, { headers: { "cache-control": "no-store" } });
}

// Update the workspace brand kit (administrators only).
export async function PUT(request: Request) {
  const decision = await authorizeRequest(request, "manage-sources", env as unknown as Record<string, unknown>);
  if (!decision.allowed) return Response.json({ error: "Updating branding requires an administrator role.", reason: decision.reason }, { status: 403 });

  let body: Record<string, unknown>;
  try { body = (await request.json()) as Record<string, unknown>; }
  catch { return Response.json({ error: "Invalid JSON body." }, { status: 400 }); }

  const patch: Record<string, unknown> = {};
  if (typeof body.workspaceName === "string") patch.workspaceName = body.workspaceName.slice(0, 80);
  if (typeof body.fontFamily === "string") patch.fontFamily = body.fontFamily.slice(0, 80);
  if (body.logoKey === null || typeof body.logoKey === "string") patch.logoKey = body.logoKey;
  const primary = cleanColor(body.primaryColor);
  const accent = cleanColor(body.accentColor);
  if (primary === undefined && body.primaryColor !== undefined) return Response.json({ error: "primaryColor must be a hex colour." }, { status: 400 });
  if (accent === undefined && body.accentColor !== undefined) return Response.json({ error: "accentColor must be a hex colour." }, { status: 400 });
  if (primary !== undefined) patch.primaryColor = primary;
  if (accent !== undefined) patch.accentColor = accent;

  const store = getStore(env as unknown as Record<string, unknown>);
  const organisationId = decision.principal?.organisationId;
  const brand = await store.upsertBrand(organisationId, patch);
  await store.recordAudit({ organisationId, actor: decision.principal?.displayName, role: decision.principal?.role, eventType: "brand.updated", entityType: "brand", entityId: organisationId, detail: `primary=${brand.primaryColor} accent=${brand.accentColor}` });
  return Response.json({ brand }, { headers: { "cache-control": "no-store" } });
}
