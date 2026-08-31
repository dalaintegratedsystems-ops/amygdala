// Vendor SaaS simulation builder: pure, dependency-free helpers for turning a
// vendor product into a guided training simulation.
//
// The builder supports two modes:
//   - "iframe": embed a sandbox URL in a sandboxed <iframe> with an authored
//     guided-overlay layer (ordered steps + hotspots + coaching).
//   - "screenshot": a DOM-capture guided walkthrough over author-uploaded
//     screens (no vendor infrastructure required) — the fallback used when a
//     target refuses to be framed.
//
// Safety model (enforced together with the runtime UI):
//   - Only origins on the per-workspace allow-list may be embedded.
//   - Targets must be https (localhost permitted for authoring/testing only).
//   - Non-embeddable targets (X-Frame-Options / CSP frame-ancestors) fall back
//     to the screenshot walkthrough.
//   - The iframe always carries a restrictive `sandbox` attribute and explicit
//     "SIMULATION — not production" chrome. Authors never point at production.

// Parse a URL and return its lower-cased origin (scheme://host[:port]), or null
// when the input is not a valid absolute http(s) URL.
export function normaliseOrigin(input) {
  try {
    const url = new URL(String(input));
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.origin.toLowerCase();
  } catch {
    return null;
  }
}

// A target URL is acceptable when it is https (or http on localhost for
// authoring/testing) and never obviously a production system.
export function isAcceptableTarget(input) {
  try {
    const url = new URL(String(input));
    const isLocal = /^(localhost|127\.0\.0\.1|\[::1\])$/i.test(url.hostname);
    if (url.protocol === "http:" && !isLocal) return { ok: false, reason: "insecure-scheme" };
    if (url.protocol !== "http:" && url.protocol !== "https:") return { ok: false, reason: "unsupported-scheme" };
    return { ok: true, reason: "acceptable", origin: url.origin.toLowerCase() };
  } catch {
    return { ok: false, reason: "invalid-url" };
  }
}

// Decide whether a URL is permitted by the workspace allow-list of origins.
export function isOriginAllowed(input, allowedOrigins = []) {
  const origin = normaliseOrigin(input);
  if (!origin) return false;
  const set = new Set((Array.isArray(allowedOrigins) ? allowedOrigins : []).map((entry) => String(typeof entry === "string" ? entry : entry?.origin ?? "").toLowerCase()));
  return set.has(origin);
}

// Given the response headers of a target page, decide whether it can be framed
// on our origin. Mirrors browser enforcement of X-Frame-Options and CSP
// `frame-ancestors`.
//   headers: a Headers instance or a plain object of header name -> value.
//   selfOrigin: the origin the simulator is served from (e.g. https://app...).
export function detectEmbeddable(headers, selfOrigin) {
  const get = (name) => {
    if (!headers) return "";
    if (typeof headers.get === "function") return headers.get(name) ?? "";
    const lower = name.toLowerCase();
    for (const key of Object.keys(headers)) {
      if (key.toLowerCase() === lower) return String(headers[key] ?? "");
    }
    return "";
  };

  const xfo = get("x-frame-options").trim().toLowerCase();
  if (xfo === "deny") return { embeddable: false, reason: "x-frame-options-deny" };
  if (xfo === "sameorigin") {
    // Only embeddable if the target is same-origin as us (usually not).
    return { embeddable: false, reason: "x-frame-options-sameorigin" };
  }
  if (xfo.startsWith("allow-from")) {
    const allowed = normaliseOrigin(xfo.replace(/^allow-from\s*/, ""));
    return allowed && allowed === normaliseOrigin(selfOrigin)
      ? { embeddable: true, reason: "x-frame-options-allow-from" }
      : { embeddable: false, reason: "x-frame-options-allow-from-mismatch" };
  }

  const csp = get("content-security-policy");
  const directive = parseFrameAncestors(csp);
  if (directive !== null) {
    if (directive.length === 0 || directive.includes("'none'")) {
      return { embeddable: false, reason: "csp-frame-ancestors-none" };
    }
    const allowsAny = directive.some((token) => token === "*" || token === "https:" || token === "http:");
    const self = normaliseOrigin(selfOrigin);
    const allowsSelf = self ? directive.some((token) => normaliseOrigin(token) === self) : false;
    if (!allowsAny && !allowsSelf) return { embeddable: false, reason: "csp-frame-ancestors-restricted" };
  }

  return { embeddable: true, reason: "no-blocking-headers" };
}

// Extract the tokens of a CSP `frame-ancestors` directive, or null when the
// header has no such directive.
function parseFrameAncestors(csp) {
  if (typeof csp !== "string" || csp.trim() === "") return null;
  for (const part of csp.split(";")) {
    const trimmed = part.trim();
    if (/^frame-ancestors\b/i.test(trimmed)) {
      return trimmed.split(/\s+/).slice(1).map((token) => token.trim()).filter(Boolean);
    }
  }
  return null;
}

// Validate + normalise an authored simulation definition before it is stored.
// Returns { ok, simulation | error }. Keeps the shape small and predictable.
export function normaliseSimulationDefinition(input = {}) {
  const title = typeof input.title === "string" ? input.title.trim().slice(0, 160) : "";
  if (!title) return { ok: false, error: "A simulation title is required." };

  const mode = input.mode === "screenshot" ? "screenshot" : "iframe";
  const targetUrl = typeof input.targetUrl === "string" ? input.targetUrl.trim() : "";

  if (mode === "iframe") {
    if (!targetUrl) return { ok: false, error: "An iframe simulation needs a sandbox target URL." };
    const target = isAcceptableTarget(targetUrl);
    if (!target.ok) return { ok: false, error: `Target URL is not acceptable (${target.reason}).` };
  }

  const steps = (Array.isArray(input.steps) ? input.steps : []).map((step, index) => ({
    id: typeof step?.id === "string" && step.id ? step.id : `step-${index + 1}`,
    label: String(step?.label ?? `Step ${index + 1}`).slice(0, 200),
    coaching: String(step?.coaching ?? "").slice(0, 400),
    hotspot: normaliseHotspot(step?.hotspot),
    screenIndex: Number.isInteger(step?.screenIndex) ? step.screenIndex : 0,
    match: step?.match && typeof step.match.event === "string" ? { event: step.match.event.slice(0, 120) } : null,
  }));

  const screens = (Array.isArray(input.screens) ? input.screens : []).map((screen, index) => ({
    key: typeof screen?.key === "string" ? screen.key : "",
    url: typeof screen?.url === "string" ? screen.url : "",
    alt: String(screen?.alt ?? `Screen ${index + 1}`).slice(0, 200),
    width: Number.isFinite(screen?.width) ? Math.round(screen.width) : null,
    height: Number.isFinite(screen?.height) ? Math.round(screen.height) : null,
  })).filter((screen) => screen.key || screen.url);

  if (mode === "screenshot" && screens.length === 0) {
    return { ok: false, error: "A screenshot simulation needs at least one uploaded screen." };
  }

  return {
    ok: true,
    simulation: {
      title,
      description: typeof input.description === "string" ? input.description.slice(0, 600) : "",
      mode,
      targetUrl,
      embeddable: input.embeddable !== false,
      bridgeEnabled: Boolean(input.bridgeEnabled),
      status: input.status === "Published" ? "Published" : "Draft",
      steps,
      screens,
    },
  };
}

// Client-side publish gate. Mirrors the server 400s so the UI can disable
// Publish (screenshot with no screens, iframe with no acceptable URL).
export function publishBlockedReason(definition = {}) {
  const title = typeof definition.title === "string" ? definition.title.trim() : "";
  if (!title) return "Add a title before publishing.";
  const mode = definition.mode === "screenshot" ? "screenshot" : "iframe";
  if (mode === "screenshot") {
    const screens = Array.isArray(definition.screens) ? definition.screens : [];
    const uploaded = screens.some((screen) => (typeof screen?.key === "string" && screen.key) || (typeof screen?.url === "string" && screen.url));
    if (!uploaded) return "Upload at least one screen before publishing a screenshot walkthrough.";
    return "";
  }
  const target = isAcceptableTarget(definition.targetUrl);
  if (!target.ok) return "Set a valid https sandbox URL before publishing an embed.";
  return "";
}

function normaliseHotspot(hotspot) {
  if (!hotspot || typeof hotspot !== "object") return null;
  const clamp = (value) => Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
  return {
    x: clamp(hotspot.x),
    y: clamp(hotspot.y),
    w: clamp(hotspot.w ?? 12),
    h: clamp(hotspot.h ?? 8),
  };
}

// Deterministic score for a simulation run: each error costs 8 points, floored
// at 60 (mirrors the built-in scenario scoring so readiness stays consistent).
export function scoreSimulationRun({ steps = 0, errors = 0 } = {}) {
  const total = Math.max(1, steps);
  const penalty = Math.min(errors, total) * 8;
  return Math.max(60, 100 - penalty);
}

// Build the SANDBOX token list for the embedding iframe. Restrictive by
// default: scripts + forms so the vendor SPA works, but NO same-origin access
// to our app, NO top navigation, NO popups-to-escape-sandbox.
export function simulationSandboxTokens() {
  return ["allow-scripts", "allow-forms", "allow-popups", "allow-modals", "allow-pointer-lock"];
}
