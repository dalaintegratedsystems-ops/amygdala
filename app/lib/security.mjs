// Enterprise identity, tenancy and security layer.
//
// Replaces the demo's hardcoded `org-nexus` assumption with an explicit
// identity + capability model that enforces role-based access AND tenant
// isolation at the decision layer, plus a config-level representation of
// SSO / SCIM, an AI-adapter abstraction that keeps a future live model
// behind the same grounded boundary, and an exportable audit trail.

import { organisations } from "./domain.mjs";

// Platform roles and the capabilities each one grants. This is the
// authoritative superset; `domain.canAccess` remains for the demo's
// three coarse roles and is unchanged.
export const platformRoleCapabilities = {
  "Vendor Administrator": [
    "view-admin",
    "manage-sources",
    "approve-source",
    "publish-source",
    "generate-course",
    "view-ai-activity",
    "view-analytics",
    "run-eval",
    "export-audit",
    "manage-identity",
    "issue-credential",
  ],
  "Training Manager": [
    "view-admin",
    "manage-sources",
    "approve-source",
    "generate-course",
    "view-ai-activity",
    "view-analytics",
    "run-eval",
  ],
  "Customer Learner": ["view-learner", "ask-guide", "complete-training"],
};

// Deterministic demo identities across the vendor and its customers.
export const identities = [
  { token: "tok-vera", userId: "usr-vera", displayName: "Vera Ndlovu", email: "vera@nexusflow.example", organisationId: "org-nexus", role: "Vendor Administrator" },
  { token: "tok-theo", userId: "usr-theo", displayName: "Theo Adeyemi", email: "theo@nexusflow.example", organisationId: "org-nexus", role: "Training Manager" },
  { token: "tok-aisha", userId: "usr-aisha", displayName: "Aisha Naidoo", email: "aisha@aurora.example", organisationId: "org-aurora", role: "Customer Learner" },
  { token: "tok-priya", userId: "usr-priya", displayName: "Priya Singh", email: "priya@meridian.example", organisationId: "org-meridian", role: "Customer Learner" },
];

export function resolveIdentity(token) {
  return identities.find((identity) => identity.token === token) ?? null;
}

function organisationById(id) {
  return organisations.find((org) => org.id === id) ?? null;
}

// A vendor tenant may act on its own org and on customer orgs it owns.
function tenantReachable(actorOrganisationId, resourceOrganisationId) {
  if (!resourceOrganisationId || actorOrganisationId === resourceOrganisationId) return true;
  const resource = organisationById(resourceOrganisationId);
  return Boolean(resource && resource.vendorId === actorOrganisationId);
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

// Resolve an identity token and make an authorization decision in one call.
// Used by API routes to enforce RBAC + tenant isolation at the edge.
export function authorizeIdentity(token, action, resourceOrganisationId) {
  const identity = resolveIdentity(token);
  if (!identity) return { allowed: false, reason: "no-identity", identity: null };
  const decision = authorize({ role: identity.role, action, actorOrganisationId: identity.organisationId, resourceOrganisationId });
  return { ...decision, identity };
}

// Config-level enterprise identity posture surfaced in the admin console.
// These describe how a production deployment would be wired; the prototype
// runs credential-free, so nothing here performs a live handshake.
export const enterpriseIdentityConfig = {
  sso: {
    protocol: "SAML 2.0 / OIDC",
    status: "Configurable",
    defaultConnection: "Okta (SAML)",
    enforcedForRoles: ["Vendor Administrator", "Training Manager"],
    justInTimeProvisioning: true,
  },
  scim: {
    protocol: "SCIM 2.0",
    status: "Configurable",
    syncedResources: ["Users", "Groups"],
    deprovisionOnRemoval: true,
  },
  session: {
    idleTimeoutMinutes: 30,
    absoluteTimeoutHours: 12,
    mfa: "Delegated to IdP",
  },
  dataResidency: {
    regions: ["eu", "us"],
    encryptionAtRest: "AES-256",
    encryptionInTransit: "TLS 1.2+",
    tenantIsolation: "Row-scoped by organisationId on every query",
  },
  compliance: ["SOC 2 Type II (target)", "ISO 27001 (target)", "GDPR"],
};

// AI adapter abstraction. The default stays deterministic-grounded and
// credential-free; a live adapter only activates when a server-side key is
// present, and it MUST keep the same retrieval boundary and response
// contract. `describeAdapter` never leaks secret values.
export function describeAdapter(env = {}) {
  const configured = String(env.AI_ADAPTER ?? "deterministic").toLowerCase();
  const hasKey = Boolean(env.AI_API_KEY && String(env.AI_API_KEY).length > 0);
  const live = configured === "live" && hasKey;
  return {
    name: live ? "live-grounded" : "deterministic-grounded",
    mode: live ? "live" : "deterministic",
    credentialed: hasKey,
    serverSideOnly: true,
    retrievalBoundary: "Approved + Published sources, tenant-isolated",
    responseContract: "status + grounded answer + citations + escalation",
  };
}

// ---- Audit trail -----------------------------------------------------

export const seedAuditEvents = [
  { id: "evt-1001", organisationId: "org-nexus", actor: "Vera Ndlovu", role: "Vendor Administrator", eventType: "source.published", entityType: "source", entityId: "src-projects", detail: "Published v4.2", createdAt: "2026-08-20T09:14:00.000Z" },
  { id: "evt-1002", organisationId: "org-nexus", actor: "Theo Adeyemi", role: "Training Manager", eventType: "source.approved", entityType: "source", entityId: "src-workflows", detail: "Approved for publish", createdAt: "2026-08-20T10:02:00.000Z" },
  { id: "evt-1003", organisationId: "org-aurora", actor: "Aisha Naidoo", role: "Customer Learner", eventType: "ai.answer", entityType: "conversation", entityId: "conv-88", detail: "status=Verified source=src-projects", createdAt: "2026-08-21T08:42:00.000Z" },
  { id: "evt-1004", organisationId: "org-meridian", actor: "Daniel Molefe", role: "Customer Learner", eventType: "ai.escalation", entityType: "conversation", entityId: "conv-91", detail: "status=Not covered reason=no-approved-source", createdAt: "2026-08-21T09:05:00.000Z" },
  { id: "evt-1005", organisationId: "org-nexus", actor: "Vera Ndlovu", role: "Vendor Administrator", eventType: "credential.issued", entityType: "certificate", entityId: "AMY-NF-0042", detail: "readiness=91", createdAt: "2026-08-22T14:20:00.000Z" },
];

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
