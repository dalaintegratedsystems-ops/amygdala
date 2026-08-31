import { env } from "cloudflare:workers";
import { authenticate, buildSessionCookie, createSession, getSessionSecret } from "../../../lib/auth.mjs";
import { ensureBootstrap } from "../../../lib/store.mjs";
import { MFA_CHALLENGE_TTL_SECONDS, signActionToken, verifyActionToken } from "../../../lib/tokens.mjs";
import { verifyTotp } from "../../../lib/totp.mjs";

type RuntimeEnv = Record<string, unknown>;

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

  let body: { email?: string; password?: string; totp?: string; mfaToken?: string };
  try {
    body = (await request.json()) as { email?: string; password?: string; totp?: string; mfaToken?: string };
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  const store = await ensureBootstrap(env as unknown as RuntimeEnv);
  const secret = getSessionSecret(env as unknown as RuntimeEnv);
  let user = body.email ? await store.findUserByEmail(body.email) : null;

  if (body.mfaToken && !user) {
    const challenge = await verifyActionToken(body.mfaToken, secret, { purpose: "mfa" });
    if (!challenge.valid) return Response.json({ error: "MFA challenge expired. Sign in again." }, { status: 401 });
    user = await store.findUserById(challenge.payload.sub);
  } else {
    const result = await authenticate(user, body?.password);
    if (!result.ok || !result.principal) return Response.json({ error: "Invalid email or password." }, { status: 401 });
  }

  if (!user) return Response.json({ error: "Invalid email or password." }, { status: 401 });

  const profile = await store.getUserProfile(user.organisationId, user.userId);
  if (profile.status === "suspended" || profile.status === "deactivated") {
    return Response.json({ error: "This account is not active.", status: profile.status }, { status: 403 });
  }
  if (profile.status === "invited") {
    return Response.json({ error: "Accept your invite and set a password before signing in." }, { status: 403 });
  }

  if (profile.mfaEnabled) {
    if (!body.totp) {
      const mfaToken = await signActionToken({ purpose: "mfa", sub: user.userId }, secret, { ttlSeconds: MFA_CHALLENGE_TTL_SECONDS });
      return Response.json({ mfaRequired: true, mfaToken }, { headers: { "cache-control": "no-store" } });
    }
    if (!(await verifyTotp(profile.mfaSecret, body.totp))) {
      return Response.json({ error: "Invalid authenticator code." }, { status: 401 });
    }
  }

  const principal = { userId: user.userId, email: user.email, displayName: user.displayName, role: user.role, organisationId: user.organisationId };
  const token = await createSession(principal, secret);
  const secure = new URL(request.url).protocol === "https:";
  console.log(JSON.stringify({ event: "auth_login", userId: principal.userId, role: principal.role, timestamp: new Date().toISOString() }));
  return new Response(JSON.stringify({ user: principal }), {
    status: 200,
    headers: { "content-type": "application/json", "cache-control": "no-store", "set-cookie": buildSessionCookie(token, { secure }) },
  });
}
