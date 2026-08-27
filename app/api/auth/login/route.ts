import { env } from "cloudflare:workers";
import { authenticate, buildSessionCookie, createSession, getSessionSecret } from "../../../lib/auth.mjs";
import { ensureBootstrap } from "../../../lib/store.mjs";

// Basic brute-force throttle per client IP.
const attempts = new Map<string, { count: number; startedAt: number }>();
const WINDOW_MS = 60_000;
const MAX_ATTEMPTS = 8;

export async function POST(request: Request) {
  const client = request.headers.get("cf-connecting-ip") ?? "local";
  const now = Date.now();
  const current = attempts.get(client);
  const window = !current || now - current.startedAt > WINDOW_MS ? { count: 0, startedAt: now } : current;
  window.count += 1;
  attempts.set(client, window);
  if (window.count > MAX_ATTEMPTS) return Response.json({ error: "Too many sign-in attempts. Please wait a minute." }, { status: 429, headers: { "retry-after": "60" } });

  let body: { email?: string; password?: string };
  try {
    body = (await request.json()) as { email?: string; password?: string };
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  // Bootstrap the workspace + admin on first boot, then verify against the DB.
  const store = await ensureBootstrap(env as unknown as Record<string, unknown>);
  const user = await store.findUserByEmail(body?.email);
  const result = await authenticate(user, body?.password);
  if (!result.ok || !result.principal) return Response.json({ error: "Invalid email or password." }, { status: 401 });
  const principal = result.principal;

  const token = await createSession(principal, getSessionSecret(env as unknown as Record<string, unknown>));
  const secure = new URL(request.url).protocol === "https:";
  console.log(JSON.stringify({ event: "auth_login", userId: principal.userId, role: principal.role, timestamp: new Date().toISOString() }));
  return new Response(JSON.stringify({ user: principal }), {
    status: 200,
    headers: { "content-type": "application/json", "cache-control": "no-store", "set-cookie": buildSessionCookie(token, { secure }) },
  });
}
