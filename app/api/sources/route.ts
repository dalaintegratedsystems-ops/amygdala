import { env } from "cloudflare:workers";
import { authorizeRequest } from "../../lib/auth.mjs";

const ALLOWED_TYPES = new Set(["application/pdf", "text/plain", "text/markdown", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "image/png", "image/jpeg"]);
const MAX_BYTES = 10 * 1024 * 1024;

export async function POST(request: Request) {
  const decision = await authorizeRequest(request, "manage-sources", env as unknown as Record<string, unknown>);
  if (!decision.allowed) return Response.json({ error: "Administrator access required.", reason: decision.reason }, { status: 403 });
  const organisationId = decision.principal?.organisationId ?? "org-nexus";

  const data = await request.formData();
  const file = data.get("file");
  if (!(file instanceof File) || !ALLOWED_TYPES.has(file.type) || file.size === 0 || file.size > MAX_BYTES) return Response.json({ error: "Unsupported file type or size." }, { status: 400 });
  const runtime = env as unknown as { SOURCES?: R2Bucket; DB?: D1Database };
  if (!runtime.SOURCES) return Response.json({ error: "Source storage is unavailable. The seeded demo remains available." }, { status: 503 });
  const safeName = file.name.normalize("NFKC").replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 120);
  const id = crypto.randomUUID();
  const key = `${organisationId}/${new Date().toISOString().slice(0, 10)}/${id}-${safeName}`;
  await runtime.SOURCES.put(key, file.stream(), { httpMetadata: { contentType: file.type }, customMetadata: { organisationId, sourceId: id } });
  console.log(JSON.stringify({ event: "source_uploaded", organisationId, sourceId: id, contentType: file.type, size: file.size, timestamp: new Date().toISOString() }));
  return Response.json({ id, title: safeName, status: "Processing", approvalStatus: "Pending" }, { status: 201 });
}
