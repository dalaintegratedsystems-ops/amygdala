import { clearSessionCookie } from "../../../lib/auth.mjs";

export async function POST(request: Request) {
  const secure = new URL(request.url).protocol === "https:";
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "content-type": "application/json", "cache-control": "no-store", "set-cookie": clearSessionCookie({ secure }) },
  });
}
