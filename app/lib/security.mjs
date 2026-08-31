// Authorization, tenancy and the AI-adapter posture.
//
// Ships no fictional identities or audit content. Provides the role/capability
// model, a tenant-isolation decision, the grounded AI-adapter description and
// audit-export helpers used by the API routes.

// The full capability catalogue (id + human label) used by the RBAC console and
// custom-role editor. Kept flat and small — a capability model, not a policy
// engine.
export const capabilityCatalog = [
  { id: "view-admin", label: "Access the admin workspace" },
  { id: "manage-sources", label: "Upload & edit knowledge sources" },
  { id: "approve-source", label: "Approve / reject sources" },
  { id: "publish-source", label: "Publish approved sources" },
  { id: "generate-course", label: "Generate grounded courses" },
  { id: "view-ai-activity", label: "View AI guidance activity" },
  { id: "view-analytics", label: "View analytics" },
  { id: "export-audit", label: "Export the audit trail" },
  { id: "manage-users", label: "Manage user accounts" },
  { id: "assign-roles", label: "Assign roles to users" },
  { id: "manage-roles", label: "Create custom roles" },
  { id: "manage-cohorts", label: "Manage cohorts / teams" },
  { id: "manage-assignments", label: "Assign courses & pathways" },
  { id: "view-manager-dashboard", label: "View the manager dashboard" },
  { id: "send-nudge", label: "Send learner nudges" },
  { id: "import-users", label: "Bulk-import users (CSV)" },
  { id: "manage-provisioning", label: "Configure SSO / SCIM" },
  { id: "ask-guide", label: "Ask the Product Guide" },
  { id: "view-learner", label: "Access the learner workspace" },
  { id: "view-assignments", label: "View own assignments" },
  { id: "complete-training", label: "Complete training & assessments" },
];

export const allCapabilities = capabilityCatalog.map((entry) => entry.id);

// Admin-tier capabilities shared by Org Owner / Admin / the legacy Vendor
// Administrator role. Least-privilege tiers below narrow from here.
const ADMIN_CAPS = [
  "view-admin", "manage-sources", "approve-source", "publish-source", "generate-course",
  "view-ai-activity", "view-analytics", "export-audit", "ask-guide",
  "manage-users", "assign-roles", "manage-roles", "manage-cohorts", "manage-assignments",
  "view-manager-dashboard", "send-nudge", "import-users", "manage-provisioning",
];
const LEARNER_CAPS = ["view-learner", "ask-guide", "complete-training", "view-assignments"];

// Platform roles and the capabilities each one grants. Clear tiers
// (Org Owner › Admin › Training Manager › Author › Reviewer › Learner) plus the
// original role names kept as aliases so existing sessions/tests keep working.
export const platformRoleCapabilities = {
  "Org Owner": [...allCapabilities],
  "Admin": [...ADMIN_CAPS],
  "Training Manager": [
    "view-admin", "manage-sources", "approve-source", "generate-course",
    "view-ai-activity", "view-analytics", "ask-guide",
    "manage-cohorts", "manage-assignments", "view-manager-dashboard", "send-nudge", "import-users",
  ],
  "Author": ["view-admin", "manage-sources", "generate-course", "ask-guide"],
  "Reviewer": ["view-admin", "approve-source", "view-ai-activity", "ask-guide"],
  "Learner": [...LEARNER_CAPS],
  // Legacy aliases (pre-Workstream-B). Kept exactly as-permissive-or-more so
  // existing tests and the live admin/learner sessions continue to work.
  "Vendor Administrator": [...ADMIN_CAPS],
  "Customer Learner": [...LEARNER_CAPS],
};

// The ordered tier list surfaced in the RBAC console (owner → learner).
export const roleTiers = ["Org Owner", "Admin", "Training Manager", "Author", "Reviewer", "Learner"];

// Resolve the effective capability set for a role. Built-in tiers come from the
// table above; anything else is treated as a per-workspace custom role and
// resolved from the provided custom-role list (name -> capabilities).
export function resolveCapabilities(role, customRoles = []) {
  if (platformRoleCapabilities[role]) return platformRoleCapabilities[role];
  const custom = (customRoles || []).find((entry) => entry && entry.name === role);
  return custom ? (custom.capabilities || []) : [];
}

// A principal may act on its own organisation only. (A vendor-owns-customer
// hierarchy can be layered on later; P0 is one workspace per user.)
function tenantReachable(actorOrganisationId, resourceOrganisationId) {
  return !resourceOrganisationId || actorOrganisationId === resourceOrganisationId;
}

// Central authorization decision: role capability AND tenant isolation.
// `capabilities` may be passed explicitly (e.g. resolved custom-role caps);
// otherwise the built-in tier table is used, preserving the original contract.
export function authorize({ role, action, actorOrganisationId, resourceOrganisationId, capabilities } = {}) {
  const effective = capabilities ?? platformRoleCapabilities[role];
  if (!effective || !effective.includes(action)) {
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
