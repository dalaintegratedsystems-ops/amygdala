import assert from "node:assert/strict";
import test from "node:test";
import {
  assignmentStatus,
  assignmentsForUser,
  decorateAssignment,
  effectiveCohortIds,
  managerSnapshot,
  resolveCohortMemberIds,
} from "../app/lib/assignments.mjs";
import { createMemoryStore } from "../app/lib/store-core.mjs";

test("auto-enrolment unions explicit members with matching roles", () => {
  const cohort = { id: "coh-1", autoEnrolRole: "Learner" };
  const users = [
    { userId: "u1", role: "Learner", status: "active" },
    { userId: "u2", role: "Admin", status: "active" },
    { userId: "u3", role: "Learner", status: "deactivated" },
  ];
  const ids = resolveCohortMemberIds(cohort, { members: ["u2"], users });
  assert.deepEqual(new Set(ids), new Set(["u1", "u2"]));
});

test("assignments expand to a user via user, role, or cohort target", () => {
  const user = { userId: "u1", role: "Learner" };
  const assignments = [
    { id: "a1", targetType: "user", targetId: "u1", courseId: "c1" },
    { id: "a2", targetType: "role", targetId: "Learner", courseId: "c2" },
    { id: "a3", targetType: "cohort", targetId: "coh-1", courseId: "c3" },
    { id: "a4", targetType: "user", targetId: "other", courseId: "c4" },
  ];
  const mine = assignmentsForUser(user, assignments, { cohortIds: ["coh-1"] });
  assert.deepEqual(mine.map((a) => a.id).sort(), ["a1", "a2", "a3"]);
});

test("per-assignment status uses progress and due date", () => {
  const duePast = "2020-01-01T00:00:00.000Z";
  assert.equal(assignmentStatus({ dueDate: null }, null).status, "not-started");
  assert.equal(assignmentStatus({ dueDate: duePast }, null).status, "overdue");
  assert.equal(assignmentStatus({ dueDate: duePast }, { learningScore: 40, readiness: 12 }).status, "overdue");
  assert.equal(assignmentStatus({ dueDate: duePast }, { readiness: 88, status: "ready" }).status, "completed");
  assert.equal(assignmentStatus({ dueDate: null }, { learningScore: 100, readiness: 30 }).status, "in-progress");
});

test("store-backed auto-enrol + assignment status end-to-end", async () => {
  const store = createMemoryStore();
  const org = "org-a";
  await store.createUser({ userId: "u-learn", email: "l@x.com", displayName: "Lee", organisationId: org, role: "Learner", credential: { salt: "00", hash: "00", iterations: 1 } });
  await store.createUser({ userId: "u-admin", email: "a@x.com", displayName: "Ada", organisationId: org, role: "Admin", credential: { salt: "00", hash: "00", iterations: 1 } });
  const cohort = await store.createCohort(org, { name: "New hires", autoEnrolRole: "Learner" });
  const assignment = await store.createAssignment(org, { targetType: "cohort", targetId: cohort.id, courseId: "course-1", required: true, dueDate: "2099-01-01" });
  const users = await store.listUsers(org);
  const members = resolveCohortMemberIds(cohort, { members: await store.listCohortMembers(org, cohort.id), users });
  assert.ok(members.includes("u-learn"));
  assert.equal(members.includes("u-admin"), false);

  await store.upsertLearnerProgress(org, "u-learn", "course-1", { learningScore: 100, simulationScore: 90, assessmentScore: 80, readiness: 90, status: "ready" });
  const progress = await store.getLearnerProgress(org, "u-learn", "course-1");
  const decorated = decorateAssignment(assignment, { course: { title: "Onboarding" }, progress });
  assert.equal(decorated.status, "completed");
  assert.equal(decorated.courseTitle, "Onboarding");
});

test("manager snapshot flags at-risk and gap rows without leaking other roles", () => {
  const snapshot = managerSnapshot({
    users: [
      { userId: "u1", email: "l@x.com", displayName: "Lee", role: "Learner", status: "active" },
      { userId: "u2", email: "a@x.com", displayName: "Ada", role: "Admin", status: "active" },
    ],
    assignments: [{ id: "a1", targetType: "role", targetId: "Learner", courseId: "c1", required: 1, dueDate: "2020-01-01" }],
    progress: [],
    courses: [{ id: "c1", title: "Safety" }],
    cohorts: [],
  });
  assert.equal(snapshot.rows.length, 1);
  assert.equal(snapshot.rows[0].userId, "u1");
  assert.equal(snapshot.gaps.length, 1);
  assert.ok(effectiveCohortIds({ role: "Learner" }, [{ id: "c", autoEnrolRole: "Learner" }]).includes("c"));
});
