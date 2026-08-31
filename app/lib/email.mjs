// Email delivery seam. Delivers only when an email-provider secret is present
// (RESEND_API_KEY). Otherwise it logs the intent and returns `{ sent: false }`
// so callers can surface the invite/reset link in-UI. Never fakes a live send.

export function emailProviderConfigured(env = {}) {
  return Boolean(env.RESEND_API_KEY && String(env.RESEND_API_KEY).length > 0);
}

export function emailFromAddress(env = {}) {
  return String(env.EMAIL_FROM ?? "Amygdala <noreply@amygdalalishay.com>");
}

// Best-effort send. Never throws to the caller — a missing provider or a
// provider error both resolve to `{ sent: false, reason }`.
export async function sendEmail(env = {}, { to, subject, text, html } = {}) {
  const recipient = String(to ?? "").trim();
  if (!recipient) return { sent: false, reason: "missing-recipient" };
  if (!emailProviderConfigured(env)) {
    console.log(JSON.stringify({ event: "email_skipped", to: recipient, subject, reason: "no-provider", timestamp: new Date().toISOString() }));
    return { sent: false, reason: "no-provider" };
  }
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({ from: emailFromAddress(env), to: [recipient], subject: subject ?? "", text: text ?? "", html: html ?? undefined }),
    });
    if (!response.ok) {
      console.log(JSON.stringify({ event: "email_failed", to: recipient, status: response.status, timestamp: new Date().toISOString() }));
      return { sent: false, reason: "provider-error" };
    }
    return { sent: true, reason: "sent" };
  } catch {
    return { sent: false, reason: "provider-error" };
  }
}
