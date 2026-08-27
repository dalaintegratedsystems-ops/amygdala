import assert from "node:assert/strict";
import test from "node:test";
import {
  authorize,
  capabilitiesForRole,
  describeAdapter,
  exportAuditEvents,
  recordAuditEvent,
} from "../app/lib/security.mjs";
import { seedAuditEvents } from "./fixtures/analytics.mjs";

test("RBAC grants and denies by capability", () => {
  assert.equal(authorize({ role: "Vendor Administrator", action: "publish-source", actorOrganisationId: "org-nexus" }).allowed, true);
  assert.equal(authorize({ role: "Training Manager", action: "publish-source", actorOrganisationId: "org-nexus" }).allowed, false);
  assert.equal(authorize({ role: "Customer Learner", action: "view-admin", actorOrganisationId: "org-aurora" }).reason, "insufficient-role");
});

test("tenant isolation blocks cross-tenant access", () => {
  const cross = authorize({ role: "Customer Learner", action: "ask-guide", actorOrganisationId: "org-aurora", resourceOrganisationId: "org-meridian" });
  assert.equal(cross.allowed, false);
  assert.equal(cross.reason, "tenant-isolation");
});

test("a principal may act within its own organisation", () => {
  const sameOrg = authorize({ role: "Vendor Administrator", action: "view-ai-activity", actorOrganisationId: "org-nexus", resourceOrganisationId: "org-nexus" });
  assert.equal(sameOrg.allowed, true);
});

test("capabilities are role-scoped", () => {
  assert.ok(capabilitiesForRole("Vendor Administrator").includes("manage-sources"));
  assert.equal(capabilitiesForRole("Customer Learner").includes("manage-sources"), false);
});

test("adapter stays deterministic-grounded without a credential", () => {
  const adapter = describeAdapter({ AI_ADAPTER: "deterministic" });
  assert.equal(adapter.name, "deterministic-grounded");
  assert.equal(adapter.credentialed, false);
  assert.equal(adapter.serverSideOnly, true);
});

test("adapter goes live with a server-side key", () => {
  assert.equal(describeAdapter({ AI_ADAPTER: "live" }).mode, "deterministic");
  assert.equal(describeAdapter({ AI_ADAPTER: "live", AI_API_KEY: "sk-demo" }).mode, "live");
  assert.equal(describeAdapter({ OPENAI_API_KEY: "sk-live" }).mode, "live");
});

test("audit export produces scoped CSV and JSON", () => {
  const withNew = recordAuditEvent(seedAuditEvents, { organisationId: "org-nexus", actor: "Vera Ndlovu", role: "Vendor Administrator", eventType: "identity.updated", entityType: "sso", entityId: "okta", createdAt: "2026-08-25T00:00:00.000Z" });
  assert.equal(withNew.length, seedAuditEvents.length + 1);
  const csv = exportAuditEvents(withNew, { format: "csv", organisationId: "org-nexus" });
  assert.match(csv.split("\n")[0], /^id,createdAt,organisationId/);
  const json = JSON.parse(exportAuditEvents(withNew, { format: "json", organisationId: "org-aurora" }));
  assert.ok(json.events.every((event) => event.organisationId === "org-aurora"));
});
