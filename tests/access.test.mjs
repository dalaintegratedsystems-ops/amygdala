import assert from "node:assert/strict";
import test from "node:test";
import {
  authorize,
  capabilitiesForRole,
  platformRoleCapabilities,
  resolveCapabilities,
  roleTiers,
} from "../app/lib/security.mjs";
import { createMemoryStore } from "../app/lib/store-core.mjs";

test("tiered RBAC: owner is a superset, learner is least-privilege", () => {
  assert.deepEqual(roleTiers, ["Org Owner", "Admin", "Training Manager", "Author", "Reviewer", "Learner"]);
  const owner = capabilitiesForRole("Org Owner");
  const admin = capabilitiesForRole("Admin");
  const learner = capabilitiesForRole("Learner");
  assert.ok(owner.length > admin.length);
  assert.ok(admin.every((cap) => owner.includes(cap)));
  assert.ok(learner.includes("view-assignments"));
  assert.equal(learner.includes("manage-users"), false);
  assert.equal(authorize({ role: "Author", action: "approve-source" }).allowed, false);
  assert.equal(authorize({ role: "Reviewer", action: "approve-source" }).allowed, true);
  assert.equal(authorize({ role: "Training Manager", action: "manage-cohorts" }).allowed, true);
  assert.equal(authorize({ role: "Training Manager", action: "manage-roles" }).allowed, false);
});

test("legacy aliases keep existing sessions working", () => {
  assert.equal(authorize({ role: "Vendor Administrator", action: "publish-source", actorOrganisationId: "org-a" }).allowed, true);
  assert.equal(authorize({ role: "Customer Learner", action: "view-admin" }).allowed, false);
  assert.ok(platformRoleCapabilities["Vendor Administrator"].includes("manage-users"));
});

test("custom roles resolve only inside the supplied tenant list", () => {
  const custom = [{ name: "Coach", capabilities: ["view-admin", "view-manager-dashboard"] }];
  assert.deepEqual(resolveCapabilities("Coach", custom), ["view-admin", "view-manager-dashboard"]);
  assert.deepEqual(resolveCapabilities("Coach", []), []);
  assert.equal(authorize({ role: "Coach", action: "view-admin", capabilities: resolveCapabilities("Coach", custom) }).allowed, true);
  assert.equal(authorize({ role: "Coach", action: "manage-users", capabilities: resolveCapabilities("Coach", custom) }).allowed, false);
});

test("tenant isolation still applies when capabilities are passed in", () => {
  const decision = authorize({
    role: "Coach",
    action: "view-admin",
    capabilities: ["view-admin"],
    actorOrganisationId: "org-a",
    resourceOrganisationId: "org-b",
  });
  assert.equal(decision.allowed, false);
  assert.equal(decision.reason, "tenant-isolation");
});

test("custom roles persist per-workspace and do not leak across tenants", async () => {
  const store = createMemoryStore();
  await store.createCustomRole("org-a", { name: "Coach", capabilities: ["view-admin"] });
  await store.createCustomRole("org-b", { name: "Coach", capabilities: ["manage-users"] });
  const a = await store.getCustomRoleByName("org-a", "Coach");
  const b = await store.getCustomRoleByName("org-b", "Coach");
  assert.deepEqual(a.capabilities, ["view-admin"]);
  assert.deepEqual(b.capabilities, ["manage-users"]);
  assert.equal((await store.listCustomRoles("org-a")).length, 1);
});

test("custom-role capabilities from the store feed the same authorize decision", async () => {
  const store = createMemoryStore();
  await store.createCustomRole("org-nexus", { name: "Coach", capabilities: ["view-admin", "view-manager-dashboard"] });
  const capabilities = resolveCapabilities("Coach", await store.listCustomRoles("org-nexus"));
  assert.equal(authorize({ role: "Coach", action: "view-manager-dashboard", capabilities }).allowed, true);
  assert.equal(authorize({ role: "Coach", action: "manage-users", capabilities }).allowed, false);
});
