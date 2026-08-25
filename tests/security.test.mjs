import assert from "node:assert/strict";
import test from "node:test";
import {
  authorize,
  capabilitiesForRole,
  describeAdapter,
  enterpriseIdentityConfig,
  exportAuditEvents,
  recordAuditEvent,
  resolveIdentity,
  seedAuditEvents,
} from "../app/lib/security.mjs";

test("resolves demo identities by token", () => {
  const vera = resolveIdentity("tok-vera");
  assert.equal(vera.role, "Vendor Administrator");
  assert.equal(vera.organisationId, "org-nexus");
  assert.equal(resolveIdentity("tok-unknown"), null);
});

test("RBAC grants and denies by capability", () => {
  assert.equal(authorize({ role: "Vendor Administrator", action: "publish-source", actorOrganisationId: "org-nexus" }).allowed, true);
  assert.equal(authorize({ role: "Training Manager", action: "publish-source", actorOrganisationId: "org-nexus" }).allowed, false);
  assert.equal(authorize({ role: "Customer Learner", action: "view-admin", actorOrganisationId: "org-aurora" }).reason, "insufficient-role");
});

test("tenant isolation blocks cross-tenant access", () => {
  // A customer learner cannot reach another customer org.
  const cross = authorize({ role: "Customer Learner", action: "ask-guide", actorOrganisationId: "org-aurora", resourceOrganisationId: "org-meridian" });
  assert.equal(cross.allowed, false);
  assert.equal(cross.reason, "tenant-isolation");
});

test("a vendor tenant may reach the customers it owns", () => {
  const vendorToCustomer = authorize({ role: "Vendor Administrator", action: "view-ai-activity", actorOrganisationId: "org-nexus", resourceOrganisationId: "org-aurora" });
  assert.equal(vendorToCustomer.allowed, true);
});

test("capabilities are role-scoped", () => {
  assert.ok(capabilitiesForRole("Vendor Administrator").includes("manage-identity"));
  assert.equal(capabilitiesForRole("Customer Learner").includes("manage-identity"), false);
});

test("adapter stays deterministic-grounded without a credential", () => {
  const adapter = describeAdapter({ AI_ADAPTER: "deterministic" });
  assert.equal(adapter.name, "deterministic-grounded");
  assert.equal(adapter.credentialed, false);
  assert.equal(adapter.serverSideOnly, true);
});

test("adapter only goes live when a server-side key is present", () => {
  assert.equal(describeAdapter({ AI_ADAPTER: "live" }).mode, "deterministic");
  assert.equal(describeAdapter({ AI_ADAPTER: "live", AI_API_KEY: "sk-demo" }).mode, "live");
});

test("enterprise identity config exposes SSO and SCIM posture", () => {
  assert.match(enterpriseIdentityConfig.sso.protocol, /SAML|OIDC/);
  assert.equal(enterpriseIdentityConfig.scim.protocol, "SCIM 2.0");
});

test("audit export produces scoped CSV and JSON", () => {
  const withNew = recordAuditEvent(seedAuditEvents, { organisationId: "org-nexus", actor: "Vera Ndlovu", role: "Vendor Administrator", eventType: "identity.updated", entityType: "sso", entityId: "okta", createdAt: "2026-08-25T00:00:00.000Z" });
  assert.equal(withNew.length, seedAuditEvents.length + 1);
  const csv = exportAuditEvents(withNew, { format: "csv", organisationId: "org-nexus" });
  assert.match(csv.split("\n")[0], /^id,createdAt,organisationId/);
  const json = JSON.parse(exportAuditEvents(withNew, { format: "json", organisationId: "org-aurora" }));
  assert.ok(json.events.every((event) => event.organisationId === "org-aurora"));
});
