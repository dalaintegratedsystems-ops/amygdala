import { authorizeIdentity, exportAuditEvents, seedAuditEvents } from "../../../lib/security.mjs";

export async function GET(request: Request) {
  const token = request.headers.get("x-identity-token") ?? "";
  const decision = authorizeIdentity(token, "export-audit");
  if (!decision.allowed) return Response.json({ error: "Audit export requires the export-audit capability.", reason: decision.reason }, { status: 403 });

  const url = new URL(request.url);
  const format = url.searchParams.get("format") === "csv" ? "csv" : "json";
  // A tenant only ever exports its own scope (vendor sees its own events).
  const options = { format, organisationId: decision.identity?.organisationId };
  const payload = exportAuditEvents(seedAuditEvents, options);

  const headers: Record<string, string> = { "cache-control": "no-store" };
  if (format === "csv") {
    headers["content-type"] = "text/csv; charset=utf-8";
    headers["content-disposition"] = 'attachment; filename="amygdala-audit.csv"';
  } else {
    headers["content-type"] = "application/json; charset=utf-8";
  }
  return new Response(payload, { headers });
}
