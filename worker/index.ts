/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import { logRequest, reportError, withSecurityHeaders } from "./http";

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  SOURCES: R2Bucket;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
  CSP_MODE?: string;
  SENTRY_DSN?: string;
  SENTRY_ENVIRONMENT?: string;
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const started = Date.now();
    const requestId = request.headers.get("cf-ray") ?? crypto.randomUUID();

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
    }

    try {
      const response = await handler.fetch(request, env, ctx);
      const secured = withSecurityHeaders(response, env);
      logRequest({ method: request.method, path: url.pathname, status: secured.status, durationMs: Date.now() - started, requestId });
      return secured;
    } catch (error) {
      // Unhandled exception: log it, fire the (optional) Sentry seam, and
      // return a minimal 500 rather than letting the Worker crash.
      logRequest({ method: request.method, path: url.pathname, status: 500, durationMs: Date.now() - started, requestId, error: error instanceof Error ? error.message : String(error) });
      ctx.waitUntil(reportError(env, error, { requestId, path: url.pathname, method: request.method }));
      return withSecurityHeaders(new Response("Internal Server Error", { status: 500, headers: { "content-type": "text/plain" } }), env);
    }
  },
};

export default worker;
