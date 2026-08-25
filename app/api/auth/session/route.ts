import { env } from "cloudflare:workers";
import { resolveRequestIdentity } from "../../../lib/auth.mjs";

export async function GET(request: Request) {
  const principal = await resolveRequestIdentity(request, env as unknown as Record<string, unknown>);
  if (!principal) return Response.json({ error: "Not authenticated." }, { status: 401 });
  return Response.json({ user: principal }, { headers: { "cache-control": "no-store" } });
}
