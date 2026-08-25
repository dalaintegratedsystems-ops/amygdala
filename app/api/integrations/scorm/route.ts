import { env } from "cloudflare:workers";
import { buildScormManifest } from "../../../lib/analytics.mjs";
import { authorizeRequest } from "../../../lib/auth.mjs";

export async function GET(request: Request) {
  const decision = await authorizeRequest(request, "view-analytics", env as unknown as Record<string, unknown>);
  if (!decision.allowed) return Response.json({ error: "SCORM export requires the view-analytics capability.", reason: decision.reason }, { status: 403 });

  const url = new URL(request.url);
  const programme = { id: url.searchParams.get("programme") ?? "prog-nexus", title: "NexusFlow Project Manager Onboarding" };
  const manifest = buildScormManifest(programme);
  return new Response(manifest, {
    headers: {
      "content-type": "application/xml; charset=utf-8",
      "content-disposition": 'attachment; filename="imsmanifest.xml"',
      "cache-control": "no-store",
    },
  });
}
