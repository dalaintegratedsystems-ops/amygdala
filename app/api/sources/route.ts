import { env } from "cloudflare:workers";
import { authorizeRequest } from "../../lib/access.mjs";
import { chunkText } from "../../lib/ingest.mjs";
import { embedChunksForStore } from "../../lib/retrieval.mjs";
import { getStore } from "../../lib/store.mjs";

const ALLOWED_TYPES = new Set(["application/pdf", "text/plain", "text/markdown", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "image/png", "image/jpeg"]);
const MAX_BYTES = 10 * 1024 * 1024;

// List the tenant's sources.
export async function GET(request: Request) {
  const decision = await authorizeRequest(request, "manage-sources", env as unknown as Record<string, unknown>);
  if (!decision.allowed) return Response.json({ error: "Administrator access required.", reason: decision.reason }, { status: 403 });
  const store = getStore(env as unknown as Record<string, unknown>);
  const sources = await store.listSources(decision.principal?.organisationId);
  return Response.json({ sources }, { headers: { "cache-control": "no-store" } });
}

// Upload a raw source document to R2 and register it as a Draft source.
export async function POST(request: Request) {
  const decision = await authorizeRequest(request, "manage-sources", env as unknown as Record<string, unknown>);
  if (!decision.allowed) return Response.json({ error: "Administrator access required.", reason: decision.reason }, { status: 403 });
  const organisationId = decision.principal?.organisationId;

  const data = await request.formData();
  const file = data.get("file");
  if (!(file instanceof File) || !ALLOWED_TYPES.has(file.type) || file.size === 0 || file.size > MAX_BYTES) return Response.json({ error: "Unsupported file type or size." }, { status: 400 });
  const runtime = env as unknown as { SOURCES?: R2Bucket };
  const safeName = file.name.normalize("NFKC").replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 120);
  const id = crypto.randomUUID();
  let storageKey: string | null = null;
  if (runtime.SOURCES) {
    storageKey = `${organisationId}/${new Date().toISOString().slice(0, 10)}/${id}-${safeName}`;
    await runtime.SOURCES.put(storageKey, file.stream(), { httpMetadata: { contentType: file.type }, customMetadata: { organisationId, sourceId: id } });
  }

  const store = getStore(env as unknown as Record<string, unknown>);
  const source = await store.createSource({
    id,
    organisationId,
    title: safeName.replace(/\.[^.]+$/, ""),
    description: `Uploaded ${safeName}.`,
    module: "Unassigned",
    intendedRole: "All roles",
    contentOwner: decision.principal?.displayName ?? "",
    type: file.type.includes("pdf") ? "PDF document" : file.type.includes("image") ? "Image" : "Document",
    version: "1.0",
    status: "Ready for review",
    approvalStatus: "Pending",
    section: "Awaiting review",
    storageKey,
    uploadDate: new Date().toISOString().slice(0, 10),
  });
  await store.recordAudit({ organisationId, actor: decision.principal?.displayName, role: decision.principal?.role, eventType: "source.uploaded", entityType: "source", entityId: id, detail: `Uploaded ${safeName}` });
  console.log(JSON.stringify({ event: "source_uploaded", organisationId, sourceId: id, contentType: file.type, size: file.size, timestamp: new Date().toISOString() }));
  return Response.json({ source }, { status: 201 });
}

// Transition a source through the review lifecycle (approve / publish / archive).
export async function PATCH(request: Request) {
  const decision = await authorizeRequest(request, "approve-source", env as unknown as Record<string, unknown>);
  if (!decision.allowed) return Response.json({ error: "Approving a source requires an administrator role.", reason: decision.reason }, { status: 403 });

  let body: { id?: string; status?: string; approvalStatus?: string };
  try { body = (await request.json()) as { id?: string; status?: string; approvalStatus?: string }; }
  catch { return Response.json({ error: "Invalid JSON body." }, { status: 400 }); }
  if (!body.id) return Response.json({ error: "A source id is required." }, { status: 400 });

  const store = getStore(env as unknown as Record<string, unknown>);
  const organisationId = decision.principal?.organisationId;
  const existing = await store.getSource(organisationId, body.id);
  if (!existing) return Response.json({ error: "Unknown source." }, { status: 404 });

  const patch: Record<string, string> = {};
  if (body.status) patch.status = body.status;
  if (body.approvalStatus) patch.approvalStatus = body.approvalStatus;
  const source = await store.updateSource(organisationId, body.id, patch);
  await store.recordAudit({ organisationId, actor: decision.principal?.displayName, role: decision.principal?.role, eventType: `source.${(body.status ?? body.approvalStatus ?? "updated").toLowerCase()}`, entityType: "source", entityId: body.id, detail: `status=${source?.status} approval=${source?.approvalStatus}` });

  // On publish, make sure section chunks exist and carry embeddings when the
  // key is available so paraphrase retrieval can use semantic vectors.
  if (source?.status === "Published" && source.extractedText) {
    try {
      const existingChunks = await store.listKnowledgeChunks(organisationId, body.id);
      const needsEmbed = existingChunks.length === 0 || existingChunks.some((chunk: { embedding?: unknown }) => !Array.isArray(chunk.embedding) || chunk.embedding.length === 0);
      if (needsEmbed) {
        const base = existingChunks.length ? existingChunks : chunkText(source.extractedText);
        const embedded = await embedChunksForStore(env as unknown as Record<string, unknown>, base);
        await store.replaceKnowledgeChunks(organisationId, body.id, embedded);
      }
    } catch {
      // Best-effort — keyword retrieval still works without vectors.
    }
  }

  return Response.json({ source }, { headers: { "cache-control": "no-store" } });
}

export async function DELETE(request: Request) {
  const decision = await authorizeRequest(request, "manage-sources", env as unknown as Record<string, unknown>);
  if (!decision.allowed) return Response.json({ error: "Deleting a source requires an administrator role.", reason: decision.reason }, { status: 403 });
  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!id) return Response.json({ error: "A source id is required." }, { status: 400 });
  const store = getStore(env as unknown as Record<string, unknown>);
  const organisationId = decision.principal?.organisationId;
  const existing = await store.getSource(organisationId, id);
  if (!existing) return Response.json({ error: "Unknown source." }, { status: 404 });
  await store.deleteSource(organisationId, id);
  await store.recordAudit({ organisationId, actor: decision.principal?.displayName, role: decision.principal?.role, eventType: "source.deleted", entityType: "source", entityId: id, detail: existing.title });
  return Response.json({ ok: true }, { headers: { "cache-control": "no-store" } });
}
