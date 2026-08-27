// Authorization, tenancy and the AI-adapter posture.
//
// Ships no fictional identities or audit content. Provides the role/capability
// model, a tenant-isolation decision, the grounded AI-adapter description and
// audit-export helpers used by the API routes.

// Platform roles and the capabilities each one grants.
export const platformRoleCapabilities = {
  "Vendor Administrator": [
    "view-admin",
    "manage-sources",
    "approve-source",
    "publish-source",
    "generate-course",
    "view-ai-activity",
    "view-analytics",
    "export-audit",
    "ask-guide",
  ],
  "Training Manager": [
    "view-admin",
    "manage-sources",
    "approve-source",
    "generate-course",
    "view-ai-activity",
    "view-analytics",
    "ask-guide",
  ],
  "Customer Learner": ["view-learner", "ask-guide", "complete-training"],
};

// A principal may act on its own organisation only. (A vendor-owns-customer
// hierarchy can be layered on later; P0 is one workspace per user.)
function tenantReachable(actorOrganisationId, resourceOrganisationId) {
  return !resourceOrganisationId || actorOrganisationId === resourceOrganisationId;
}

// Central authorization decision: role capability AND tenant isolation.
export function authorize({ role, action, actorOrganisationId, resourceOrganisationId } = {}) {
  const capabilities = platformRoleCapabilities[role];
  if (!capabilities || !capabilities.includes(action)) {
    return { allowed: false, reason: "insufficient-role" };
  }
  if (!tenantReachable(actorOrganisationId, resourceOrganisationId)) {
    return { allowed: false, reason: "tenant-isolation" };
  }
  return { allowed: true, reason: "authorized" };
}

export function capabilitiesForRole(role) {
  return platformRoleCapabilities[role] ?? [];
}

// AI adapter abstraction. The default stays deterministic-grounded and
// credential-free; a live adapter activates when a server-side OpenAI key is
// present, keeping the same retrieval boundary and response contract.
// `describeAdapter` never leaks secret values.
export function describeAdapter(env = {}) {
  const configured = String(env.AI_ADAPTER ?? "deterministic").toLowerCase();
  const hasByoKey = Boolean(env.AI_API_KEY && String(env.AI_API_KEY).length > 0);
  const hasOpenAiKey = Boolean(env.OPENAI_API_KEY && String(env.OPENAI_API_KEY).length > 0);
  const live = hasOpenAiKey || (configured === "live" && hasByoKey);
  return {
    name: hasOpenAiKey ? "gpt-5.6-sol grounded" : live ? "live-grounded" : "deterministic-grounded",
    model: hasOpenAiKey ? "gpt-5.6-sol" : null,
    mode: live ? "live" : "deterministic",
    credentialed: hasOpenAiKey || hasByoKey,
    serverSideOnly: true,
    retrievalBoundary: "Approved + Published sources, tenant-isolated",
    responseContract: "status + grounded answer + citations + escalation",
  };
}

// ---- Audit trail helpers --------------------------------------------

// Append an event to an in-memory log (used by tests and any non-persistent
// callers). Persistent audit writes go through the data store.
export function recordAuditEvent(log, event) {
  const entry = {
    id: event.id ?? `evt-${log.length + 1}`,
    organisationId: event.organisationId,
    actor: event.actor,
    role: event.role,
    eventType: event.eventType,
    entityType: event.entityType,
    entityId: event.entityId,
    detail: event.detail ?? "",
    createdAt: event.createdAt ?? new Date().toISOString(),
  };
  return [...log, entry];
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

// Export the audit trail for a tenant scope as CSV or JSON.
/**
 * @param {Array<Record<string, any>>} events
 * @param {{ format?: string, organisationId?: string }} [options]
 */
export function exportAuditEvents(events, { format = "json", organisationId } = {}) {
  const scoped = organisationId ? events.filter((event) => event.organisationId === organisationId) : events;
  if (format === "csv") {
    const columns = ["id", "createdAt", "organisationId", "actor", "role", "eventType", "entityType", "entityId", "detail"];
    const header = columns.join(",");
    const rows = scoped.map((event) => columns.map((column) => csvCell(event[column])).join(","));
    return `${[header, ...rows].join("\n")}\n`;
  }
  return JSON.stringify({ exportedAt: null, count: scoped.length, events: scoped }, null, 2);
}
