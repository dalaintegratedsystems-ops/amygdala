// Shared HTTP concerns for the Worker entry: security response headers + CSP,
// structured request/error logging, and an optional Sentry error-reporting
// seam. Kept dependency-free (a tiny fetch-based Sentry client) so the Worker
// stays lean.

interface HeaderEnv {
  CSP_MODE?: string;
  SENTRY_DSN?: string;
  SENTRY_ENVIRONMENT?: string;
}

// Content-Security-Policy tuned to what the app actually needs:
//  - vinext emits un-nonced inline bootstrap scripts, so script-src needs
//    'unsafe-inline'; 'wasm-unsafe-eval' covers client-side pdf.js.
//  - the app sets CSS custom properties via inline style attributes, so
//    style-src needs 'unsafe-inline'.
//  - images come from R2 / next-image / data + blob URLs.
//  - the vendor simulator embeds allow-listed https sandboxes in an iframe, so
//    frame-src/child-src permit https origins (the per-workspace allow-list is
//    the authoritative control, enforced in app logic + the sandboxed iframe).
//  - frame-ancestors 'self' stops the app itself from being framed elsewhere.
function contentSecurityPolicy(): string {
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "img-src 'self' data: blob:",
    "style-src 'self' 'unsafe-inline'",
    "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'",
    "font-src 'self' data:",
    "connect-src 'self'",
    "frame-src 'self' https:",
    "child-src 'self' https:",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "form-action 'self'",
    "frame-ancestors 'self'",
    "upgrade-insecure-requests",
  ].join("; ");
}

// Return a copy of `response` with security headers applied. Never clobbers a
// CSP a specific response already set (e.g. the image optimizer's stricter
// policy). Safe on streamed responses (the body stream is reused).
export function withSecurityHeaders(response: Response, env: HeaderEnv): Response {
  const headers = new Headers(response.headers);

  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("X-Frame-Options", "DENY");
  headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  headers.set("Cross-Origin-Opener-Policy", "same-origin");

  if (!headers.has("Content-Security-Policy") && !headers.has("Content-Security-Policy-Report-Only")) {
    const policy = contentSecurityPolicy();
    // Opt into report-only via the CSP_MODE secret to validate before
    // enforcing; defaults to enforced.
    const header = String(env.CSP_MODE ?? "").toLowerCase() === "report-only"
      ? "Content-Security-Policy-Report-Only"
      : "Content-Security-Policy";
    headers.set(header, policy);
  }

  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

// Emit one structured JSON log line per request. Never logs bodies, cookies or
// secrets — only coarse routing/timing metadata.
export function logRequest(entry: { method: string; path: string; status: number; durationMs: number; requestId: string; error?: string }): void {
  try {
    console.log(JSON.stringify({ event: "request", ...entry, timestamp: new Date().toISOString() }));
  } catch {
    // Logging must never throw.
  }
}

// Parse a Sentry DSN into its ingest endpoint + public key, or null if absent
// / malformed.
function parseDsn(dsn: string | undefined): { url: string; publicKey: string } | null {
  if (!dsn) return null;
  try {
    const parsed = new URL(dsn);
    const projectId = parsed.pathname.replace(/^\//, "");
    if (!projectId || !parsed.username) return null;
    const url = `${parsed.protocol}//${parsed.host}/api/${projectId}/store/`;
    return { url, publicKey: parsed.username };
  } catch {
    return null;
  }
}

// Optional error-reporting seam. Posts a minimal event to Sentry only when a
// SENTRY_DSN secret is present; otherwise a no-op. Fire-and-forget: failures
// are swallowed so reporting never affects the response.
export function reportError(env: HeaderEnv, error: unknown, context: { requestId: string; path: string; method: string }): Promise<void> {
  const dsn = parseDsn(env.SENTRY_DSN);
  if (!dsn) return Promise.resolve();

  const err = error instanceof Error ? error : new Error(String(error));
  const event = {
    event_id: (context.requestId || crypto.randomUUID()).replace(/-/g, ""),
    timestamp: new Date().toISOString(),
    platform: "javascript",
    level: "error",
    environment: env.SENTRY_ENVIRONMENT ?? "production",
    logger: "worker",
    transaction: context.path,
    tags: { method: context.method, request_id: context.requestId },
    exception: { values: [{ type: err.name, value: err.message, stacktrace: err.stack ? { frames: [] } : undefined }] },
  };
  const auth = `Sentry sentry_version=7, sentry_client=amygdala-worker/1.0, sentry_key=${dsn.publicKey}`;

  return fetch(dsn.url, {
    method: "POST",
    headers: { "content-type": "application/json", "x-sentry-auth": auth },
    body: JSON.stringify(event),
  }).then(() => undefined).catch(() => undefined);
}
