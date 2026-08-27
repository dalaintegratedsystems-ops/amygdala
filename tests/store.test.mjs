import assert from "node:assert/strict";
import test from "node:test";
import { createMemoryStore } from "../app/lib/store-core.mjs";

// Exercise the schema-free in-memory store (the same implementation `getStore`
// returns without a D1 binding). Each test builds a fresh store for isolation.
// These tests lock the new P2 persistence contracts.

test("simulations: create, list, update, get, delete", async () => {
  const store = createMemoryStore();
  const org = `org-${crypto.randomUUID()}`;
  const created = await store.createSimulation({
    id: crypto.randomUUID(),
    organisationId: org,
    title: "Create an invoice",
    mode: "iframe",
    targetUrl: "https://sandbox.example.com/app",
    steps: [{ id: "s1", label: "Open Billing", coaching: "Left nav", hotspot: { x: 5, y: 5, w: 10, h: 5 } }],
    status: "Draft",
  });
  assert.equal(created.title, "Create an invoice");
  assert.equal(created.embeddable, true);
  assert.equal(created.steps.length, 1);

  const list = await store.listSimulations(org);
  assert.equal(list.length, 1);

  const updated = await store.updateSimulation(org, created.id, { status: "Published", embeddable: false });
  assert.equal(updated.status, "Published");
  assert.equal(updated.embeddable, false);

  const published = await store.listSimulations(org, { status: "Published" });
  assert.equal(published.length, 1);

  await store.deleteSimulation(org, created.id);
  assert.equal((await store.listSimulations(org)).length, 0);
});

test("sim origins: add is idempotent per origin and scoped to the tenant", async () => {
  const store = createMemoryStore();
  const org = `org-${crypto.randomUUID()}`;
  const a = await store.addSimOrigin(org, { origin: "https://sandbox.example.com", label: "Sandbox" });
  const b = await store.addSimOrigin(org, { origin: "https://sandbox.example.com", label: "Dup" });
  assert.equal(a.id, b.id);
  const list = await store.listSimOrigins(org);
  assert.equal(list.length, 1);
  await store.removeSimOrigin(org, a.id);
  assert.equal((await store.listSimOrigins(org)).length, 0);
});

test("learner progress upsert survives and merges partial updates", async () => {
  const store = createMemoryStore();
  const org = `org-${crypto.randomUUID()}`;
  const user = "usr-1";
  const course = "course-1";
  assert.equal(await store.getLearnerProgress(org, user, course), null);

  await store.upsertLearnerProgress(org, user, course, { simulationScore: 84 });
  await store.upsertLearnerProgress(org, user, course, { assessmentScore: 90, readiness: 88, status: "ready" });

  const progress = await store.getLearnerProgress(org, user, course);
  assert.equal(progress.simulationScore, 84);
  assert.equal(progress.assessmentScore, 90);
  assert.equal(progress.readiness, 88);
  assert.equal(progress.status, "ready");

  const all = await store.listLearnerProgress(org, user);
  assert.equal(all.length, 1);
});

test("learner attempts are append-only and filterable by course", async () => {
  const store = createMemoryStore();
  const org = `org-${crypto.randomUUID()}`;
  const user = "usr-2";
  await store.recordAttempt({ organisationId: org, userId: user, courseId: "c1", kind: "simulation", score: 92, detail: { errors: 1 } });
  await store.recordAttempt({ organisationId: org, userId: user, courseId: "c1", kind: "assessment", score: 80 });
  await store.recordAttempt({ organisationId: org, userId: user, courseId: "c2", kind: "simulation", score: 100 });
  assert.equal((await store.listAttempts(org, user)).length, 3);
  assert.equal((await store.listAttempts(org, user, "c1")).length, 2);
  const first = (await store.listAttempts(org, user, "c1")).find((a) => a.kind === "simulation");
  assert.equal(first.detail.errors, 1);
});

test("credentials issue once per course and update in place", async () => {
  const store = createMemoryStore();
  const org = `org-${crypto.randomUUID()}`;
  const user = "usr-3";
  const first = await store.issueCredential({ organisationId: org, userId: user, courseId: "c1", learner: "Ada", programme: "Onboarding", readiness: 88, breakdown: { learning: 100, simulation: 84, assessment: 90 } });
  assert.equal(first.readiness, 88);
  const second = await store.issueCredential({ organisationId: org, userId: user, courseId: "c1", learner: "Ada", programme: "Onboarding", readiness: 95, breakdown: { learning: 100, simulation: 100, assessment: 90 } });
  assert.equal(second.issuedAt, first.issuedAt);
  assert.equal(second.readiness, 95);
  assert.equal((await store.listCredentials(org, user)).length, 1);
  assert.equal((await store.getCredential(org, user, "c1")).readiness, 95);
});
