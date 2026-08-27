import { env } from "cloudflare:workers";
import { exportAuditEvents } from "../../../lib/security.mjs";
import { authorizeRequest } from "../../../lib/auth.mjs";
import { getStore } from "../../../lib/store.mjs";

export async function GET(request: Request) {
  const decision = await authorizeRequest(request, "export-audit", env as unknown as Record<string, unknown>);
  if (!decision.allowed) return Response.json({ error: "Audit export requires the export-audit capability.", reason: decision.reason }, { status: 403 });

  const url = new URL(request.url);
  const format = url.searchParams.get("format") === "csv" ? "csv" : "json";
  const store = getStore(env as unknown as Record<string, unknown>);
  const events = await store.listAudit(decision.principal?.organisationId);
  const payload = exportAuditEvents(events, { format, organisationId: decision.principal?.organisationId });

  const headers: Record<string, string> = { "cache-control": "no-store" };
  if (format === "csv") {
    headers["content-type"] = "text/csv; charset=utf-8";
    headers["content-disposition"] = 'attachment; filename="amygdala-audit.csv"';
  } else {
    headers["content-type"] = "application/json; charset=utf-8";
  }
  return new Response(payload, { headers });
}
