import { verifyCredential } from "../../../lib/governance.mjs";

// Credential verification is intentionally public: anyone holding a
// credential (e.g. a hiring manager) can verify its authenticity without an
// account. Verification never trusts client-supplied validity — it
// recomputes the signature.
export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const credential = body.credential ?? body;
  const result = verifyCredential(credential, { now: new Date().toISOString() });
  return Response.json(result, { headers: { "cache-control": "no-store" } });
}
