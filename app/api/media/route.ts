import { env } from "cloudflare:workers";
import { authorizeRequest } from "../../lib/access.mjs";
import { resolveRequestIdentity } from "../../lib/auth.mjs";

const ALLOWED_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif", "image/svg+xml"]);
const MAX_BYTES = 8 * 1024 * 1024;

// Upload lesson/brand media to R2 (env.SOURCES). Returns an opaque key the
// client references via GET /api/media?key=... (optimised through env.IMAGES
// where available). Administrators only.
export async function POST(request: Request) {
  const decision = await authorizeRequest(request, "manage-sources", env as unknown as Record<string, unknown>);
  if (!decision.allowed) return Response.json({ error: "Uploading media requires an administrator role.", reason: decision.reason }, { status: 403 });
  const organisationId = decision.principal?.organisationId;

  const data = await request.formData();
  const file = data.get("file");
  if (!(file instanceof File) || !ALLOWED_TYPES.has(file.type) || file.size === 0 || file.size > MAX_BYTES) {
    return Response.json({ error: "Unsupported image type or size (PNG/JPG/WebP/GIF/SVG, max 8 MB)." }, { status: 400 });
  }

  const runtime = env as unknown as { SOURCES?: R2Bucket };
  const safeName = file.name.normalize("NFKC").replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 120);
  const key = `media/${organisationId}/${crypto.randomUUID()}-${safeName}`;
  if (!runtime.SOURCES) return Response.json({ error: "Media storage is not configured in this environment." }, { status: 503 });
  await runtime.SOURCES.put(key, file.stream(), { httpMetadata: { contentType: file.type }, customMetadata: { organisationId } });
  return Response.json({ key, url: `/api/media?key=${encodeURIComponent(key)}`, contentType: file.type }, { status: 201 });
}

// Serve a stored media object, scoped to the caller's workspace.
export async function GET(request: Request) {
  const principal = await resolveRequestIdentity(request, env as unknown as Record<string, unknown>);
  if (!principal) return new Response("Unauthorized", { status: 401 });
  const key = new URL(request.url).searchParams.get("key") ?? "";
  if (!key.startsWith(`media/${principal.organisationId}/`)) return new Response("Not found", { status: 404 });

  const runtime = env as unknown as { SOURCES?: R2Bucket; IMAGES?: { input: (o: unknown) => { output: (o: unknown) => Promise<{ response: () => Response }> } } };
  if (!runtime.SOURCES) return new Response("Not found", { status: 404 });
  const object = await runtime.SOURCES.get(key);
  if (!object) return new Response("Not found", { status: 404 });
  const contentType = object.httpMetadata?.contentType ?? "application/octet-stream";
  return new Response(object.body, { headers: { "content-type": contentType, "cache-control": "public, max-age=3600" } });
}
