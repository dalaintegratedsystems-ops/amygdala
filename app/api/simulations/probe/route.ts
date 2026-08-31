import { env } from "cloudflare:workers";
import { authorizeRequest } from "../../../lib/access.mjs";
import { detectEmbeddable, isAcceptableTarget } from "../../../lib/simbuilder.mjs";

type RuntimeEnv = Record<string, unknown>;

// Reject obviously-internal hosts to reduce SSRF surface. Vendor sandboxes are
// public; a private/link-local target is never a legitimate probe.
function isPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host === "::1" || host === "[::1]") return true;
  if (/^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host) || /^169\.254\./.test(host)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return true;
  if (host === "0.0.0.0" || host.endsWith(".internal") || host.endsWith(".local")) return true;
  return false;
}

// Probe a candidate target URL to decide whether it can be framed. Fetches the
// page server-side and inspects X-Frame-Options / CSP frame-ancestors. On any
// failure it returns embeddable:false with a reason so the author falls back to
// the screenshot walkthrough. Administrators only.
export async function POST(request: Request) {
  const decision = await authorizeRequest(request, "generate-course", env as unknown as RuntimeEnv);
  if (!decision.allowed) return Response.json({ error: "Probing a target requires an administrator role.", reason: decision.reason }, { status: 403 });

  let body: Record<string, unknown>;
  try { body = (await request.json()) as Record<string, unknown>; }
  catch { return Response.json({ error: "Invalid JSON body." }, { status: 400 }); }

  const targetUrl = typeof body.url === "string" ? body.url.trim() : "";
  const target = isAcceptableTarget(targetUrl);
  if (!target.ok) return Response.json({ embeddable: false, reason: target.reason, recommend: "screenshot" }, { status: 200 });

  let hostname = "";
  try { hostname = new URL(targetUrl).hostname; } catch { hostname = ""; }
  if (!hostname || isPrivateHost(hostname)) {
    return Response.json({ embeddable: false, reason: "private-or-invalid-host", recommend: "screenshot" }, { status: 200 });
  }

  const selfOrigin = new URL(request.url).origin;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const probe = await fetch(targetUrl, { method: "GET", redirect: "follow", signal: controller.signal, headers: { "user-agent": "AmygdalaSimProbe/1.0", accept: "text/html" } });
    const result = detectEmbeddable(probe.headers, selfOrigin);
    return Response.json({
      embeddable: result.embeddable,
      reason: result.reason,
      status: probe.status,
      recommend: result.embeddable ? "iframe" : "screenshot",
      headers: {
        "x-frame-options": probe.headers.get("x-frame-options") ?? null,
        "content-security-policy": probe.headers.get("content-security-policy") ?? null,
      },
    }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const reason = error instanceof Error && error.name === "AbortError" ? "timeout" : "unreachable";
    return Response.json({ embeddable: false, reason, recommend: "screenshot" }, { status: 200 });
  } finally {
    clearTimeout(timer);
  }
}
