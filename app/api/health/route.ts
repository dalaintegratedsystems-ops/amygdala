export async function GET() {
  return Response.json({ status: "ok", service: "amygdala", aiAdapter: "deterministic-grounded", timestamp: new Date().toISOString() }, { headers: { "cache-control": "no-store" } });
}
