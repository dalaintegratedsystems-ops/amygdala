// Data-access layer for the entities the live flows persist.
//
// A single async API backed by Cloudflare D1 (via drizzle) when the `DB`
// binding is present, and a process-local in-memory implementation otherwise
// (local dev without D1, and unit tests). Everything starts EMPTY — the store
// never ships fictional seed content. Callers (API routes) depend only on the
// async methods below, never on which backend is active.

import { and, desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../../db/schema.ts";
import {
  OWNER_ADMIN,
  createMemoryStore,
  knowledgeJsonFor,
  now,
  parseObject,
  progressKey,
  rowToSimulation,
  rowToSource,
  simulationToRow,
  sourceToRow,
} from "./store-core.mjs";

// ---- D1-backed implementation ---------------------------------------

function createD1Store(db) {
  return {
    backend: "d1",

    async findUserByEmail(email) {
      const normalised = String(email ?? "").trim().toLowerCase();
      const rows = await db.select().from(schema.users).where(eq(schema.users.email, normalised)).limit(1);
      const row = rows[0];
      if (!row) return null;
      return {
        userId: row.id,
        email: row.email,
        displayName: row.displayName,
        organisationId: row.organisationId,
        role: row.role,
        credential: { salt: row.salt, hash: row.hash, iterations: row.iterations },
      };
    },

    async countUsers() {
      const rows = await db.select({ id: schema.users.id }).from(schema.users);
      return rows.length;
    },

    async createOrganisation(org) {
      const timestamp = now();
      await db.insert(schema.organisations).values({ id: org.id, name: org.name, type: org.type ?? "vendor", createdAt: timestamp, updatedAt: timestamp });
      return { id: org.id, name: org.name, type: org.type ?? "vendor" };
    },

    async getOrganisation(id) {
      const rows = await db.select().from(schema.organisations).where(eq(schema.organisations.id, id)).limit(1);
      const row = rows[0];
      return row ? { id: row.id, name: row.name, type: row.type } : null;
    },

    async createUser(user) {
      const timestamp = now();
      await db.insert(schema.users).values({
        id: user.userId,
        email: String(user.email).trim().toLowerCase(),
        displayName: user.displayName,
        organisationId: user.organisationId,
        role: user.role,
        salt: user.credential.salt,
        hash: user.credential.hash,
        iterations: user.credential.iterations,
        createdAt: timestamp,
        updatedAt: timestamp,
      });
      return user;
    },

    async listSources(organisationId, { status } = {}) {
      const rows = await db.select().from(schema.sources).where(eq(schema.sources.organisationId, organisationId)).orderBy(desc(schema.sources.createdAt));
      return rows.map(rowToSource).filter((source) => !status || source.status === status);
    },

    async listApprovedSources(organisationId) {
      const rows = await db.select().from(schema.sources).where(eq(schema.sources.organisationId, organisationId));
      return rows.map(rowToSource).filter((source) => source.status === "Published" && source.approvalStatus === "Approved");
    },

    async getSource(organisationId, id) {
      const rows = await db.select().from(schema.sources).where(and(eq(schema.sources.organisationId, organisationId), eq(schema.sources.id, id))).limit(1);
      return rows[0] ? rowToSource(rows[0]) : null;
    },

    async createSource(source) {
      const row = sourceToRow(source, now());
      await db.insert(schema.sources).values(row);
      return rowToSource(row);
    },

    async updateSource(organisationId, id, patch) {
      const timestamp = now();
      const update = { updatedAt: timestamp };
      for (const key of ["title", "description", "product", "module", "intendedRole", "contentOwner", "type", "version", "status", "approvalStatus", "section", "storageKey", "extractedText", "explanation", "uploadDate", "effectiveDate"]) {
        if (patch[key] !== undefined) update[key] = patch[key];
      }
      if (patch.procedure !== undefined) update.procedureJson = JSON.stringify(patch.procedure);
      if (patch.keywords !== undefined) update.keywordsJson = JSON.stringify(patch.keywords);
      if (patch.documentType !== undefined || patch.outline !== undefined || patch.coverage !== undefined) {
        const current = await this.getSource(organisationId, id);
        update.knowledgeJson = knowledgeJsonFor({
          documentType: patch.documentType ?? current?.documentType ?? null,
          outline: patch.outline ?? current?.outline ?? [],
          coverage: patch.coverage ?? current?.coverage ?? null,
        });
      }
      await db.update(schema.sources).set(update).where(and(eq(schema.sources.organisationId, organisationId), eq(schema.sources.id, id)));
      return this.getSource(organisationId, id);
    },

    async createCourse(course) {
      const timestamp = now();
      const row = {
        id: course.id,
        organisationId: course.organisationId,
        sourceId: course.sourceId,
        title: course.title,
        role: course.role ?? "",
        status: course.status ?? "Draft",
        approvalStatus: course.approvalStatus ?? "Pending",
        courseJson: JSON.stringify(course.course),
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      await db.insert(schema.courses).values(row);
      return { ...course, createdAt: timestamp };
    },

    async listCourses(organisationId, { status } = {}) {
      const rows = await db.select().from(schema.courses).where(eq(schema.courses.organisationId, organisationId)).orderBy(desc(schema.courses.createdAt));
      return rows
        .map((row) => ({ id: row.id, organisationId: row.organisationId, sourceId: row.sourceId, title: row.title, role: row.role, status: row.status, approvalStatus: row.approvalStatus, course: JSON.parse(row.courseJson), createdAt: row.createdAt }))
        .filter((course) => !status || course.status === status);
    },

    async getCourse(organisationId, id) {
      const rows = await db.select().from(schema.courses).where(and(eq(schema.courses.organisationId, organisationId), eq(schema.courses.id, id))).limit(1);
      const row = rows[0];
      return row ? { id: row.id, organisationId: row.organisationId, sourceId: row.sourceId, title: row.title, role: row.role, status: row.status, approvalStatus: row.approvalStatus, course: JSON.parse(row.courseJson), createdAt: row.createdAt } : null;
    },

    async findCourseBySource(organisationId, sourceId) {
      const rows = await db.select().from(schema.courses).where(and(eq(schema.courses.organisationId, organisationId), eq(schema.courses.sourceId, sourceId))).limit(1);
      const row = rows[0];
      return row ? { id: row.id, organisationId: row.organisationId, sourceId: row.sourceId, title: row.title, role: row.role, status: row.status, approvalStatus: row.approvalStatus, course: JSON.parse(row.courseJson), createdAt: row.createdAt } : null;
    },

    async updateCourse(organisationId, id, patch) {
      const update = { updatedAt: now() };
      for (const key of ["title", "role", "status", "approvalStatus"]) {
        if (patch[key] !== undefined) update[key] = patch[key];
      }
      if (patch.course !== undefined) update.courseJson = JSON.stringify(patch.course);
      await db.update(schema.courses).set(update).where(and(eq(schema.courses.organisationId, organisationId), eq(schema.courses.id, id)));
      return this.getCourse(organisationId, id);
    },

    async recordAudit(event) {
      const timestamp = event.createdAt ?? now();
      const row = {
        id: event.id ?? crypto.randomUUID(),
        organisationId: event.organisationId,
        actor: event.actor ?? null,
        role: event.role ?? null,
        eventType: event.eventType,
        entityType: event.entityType,
        entityId: event.entityId,
        detail: event.detail ?? "",
        createdAt: timestamp,
      };
      await db.insert(schema.auditEvents).values(row);
      return row;
    },

    async listAudit(organisationId) {
      const rows = await db.select().from(schema.auditEvents).where(eq(schema.auditEvents.organisationId, organisationId)).orderBy(desc(schema.auditEvents.createdAt));
      return rows.map((row) => ({ id: row.id, organisationId: row.organisationId, actor: row.actor, role: row.role, eventType: row.eventType, entityType: row.entityType, entityId: row.entityId, detail: row.detail, createdAt: row.createdAt }));
    },

    async getBrand(organisationId) {
      try {
        const rows = await db.select().from(schema.brandKits).where(eq(schema.brandKits.organisationId, organisationId)).limit(1);
        const row = rows[0];
        return row ? { organisationId: row.organisationId, workspaceName: row.workspaceName, logoKey: row.logoKey ?? null, primaryColor: row.primaryColor, accentColor: row.accentColor, fontFamily: row.fontFamily } : null;
      } catch {
        // Table not yet migrated on this environment — behave as "no brand".
        return null;
      }
    },

    async upsertBrand(organisationId, patch) {
      const timestamp = now();
      const existing = await this.getBrand(organisationId);
      const merged = {
        organisationId,
        workspaceName: patch.workspaceName ?? existing?.workspaceName ?? "",
        logoKey: patch.logoKey !== undefined ? patch.logoKey : existing?.logoKey ?? null,
        primaryColor: patch.primaryColor ?? existing?.primaryColor ?? "",
        accentColor: patch.accentColor ?? existing?.accentColor ?? "",
        fontFamily: patch.fontFamily ?? existing?.fontFamily ?? "",
      };
      if (existing) {
        await db.update(schema.brandKits).set({ ...merged, updatedAt: timestamp }).where(eq(schema.brandKits.organisationId, organisationId));
      } else {
        await db.insert(schema.brandKits).values({ ...merged, createdAt: timestamp, updatedAt: timestamp });
      }
      return merged;
    },

    // ---- vendor simulations (tolerant of pre-migration state) --------

    async listSimulations(organisationId, { status } = {}) {
      try {
        const rows = await db.select().from(schema.simulations).where(eq(schema.simulations.organisationId, organisationId)).orderBy(desc(schema.simulations.createdAt));
        return rows.map(rowToSimulation).filter((sim) => !status || sim.status === status);
      } catch {
        return [];
      }
    },

    async getSimulation(organisationId, id) {
      try {
        const rows = await db.select().from(schema.simulations).where(and(eq(schema.simulations.organisationId, organisationId), eq(schema.simulations.id, id))).limit(1);
        return rows[0] ? rowToSimulation(rows[0]) : null;
      } catch {
        return null;
      }
    },

    async createSimulation(sim) {
      const row = simulationToRow(sim, now());
      await db.insert(schema.simulations).values(row);
      return rowToSimulation(row);
    },

    async updateSimulation(organisationId, id, patch) {
      const timestamp = now();
      const update = { updatedAt: timestamp };
      for (const key of ["title", "description", "mode", "targetUrl", "status"]) {
        if (patch[key] !== undefined) update[key] = patch[key];
      }
      if (patch.embeddable !== undefined) update.embeddable = patch.embeddable === false ? 0 : 1;
      if (patch.bridgeEnabled !== undefined) update.bridgeEnabled = patch.bridgeEnabled ? 1 : 0;
      if (patch.steps !== undefined) update.stepsJson = JSON.stringify(Array.isArray(patch.steps) ? patch.steps : []);
      if (patch.screens !== undefined) update.screensJson = JSON.stringify(Array.isArray(patch.screens) ? patch.screens : []);
      await db.update(schema.simulations).set(update).where(and(eq(schema.simulations.organisationId, organisationId), eq(schema.simulations.id, id)));
      return this.getSimulation(organisationId, id);
    },

    async deleteSimulation(organisationId, id) {
      await db.delete(schema.simulations).where(and(eq(schema.simulations.organisationId, organisationId), eq(schema.simulations.id, id)));
      return { ok: true };
    },

    async listSimOrigins(organisationId) {
      try {
        const rows = await db.select().from(schema.simOrigins).where(eq(schema.simOrigins.organisationId, organisationId)).orderBy(desc(schema.simOrigins.createdAt));
        return rows.map((row) => ({ id: row.id, organisationId: row.organisationId, origin: row.origin, label: row.label ?? "", createdAt: row.createdAt }));
      } catch {
        return [];
      }
    },

    async addSimOrigin(organisationId, { origin, label }) {
      const timestamp = now();
      const row = { id: crypto.randomUUID(), organisationId, origin, label: label ?? "", createdAt: timestamp };
      try {
        await db.insert(schema.simOrigins).values(row);
      } catch {
        // Unique conflict — origin already allow-listed. Return the existing.
        const rows = await db.select().from(schema.simOrigins).where(and(eq(schema.simOrigins.organisationId, organisationId), eq(schema.simOrigins.origin, origin))).limit(1);
        if (rows[0]) return { id: rows[0].id, organisationId, origin: rows[0].origin, label: rows[0].label ?? "", createdAt: rows[0].createdAt };
      }
      return { id: row.id, organisationId, origin, label: row.label, createdAt: timestamp };
    },

    async removeSimOrigin(organisationId, id) {
      await db.delete(schema.simOrigins).where(and(eq(schema.simOrigins.organisationId, organisationId), eq(schema.simOrigins.id, id)));
      return { ok: true };
    },

    // ---- learner persistence (tolerant of pre-migration state) -------

    async getLearnerProgress(organisationId, userId, courseId) {
      try {
        const rows = await db.select().from(schema.learnerProgress).where(and(eq(schema.learnerProgress.organisationId, organisationId), eq(schema.learnerProgress.userId, userId), eq(schema.learnerProgress.courseId, courseId))).limit(1);
        const row = rows[0];
        return row ? { organisationId, userId, courseId, learningScore: row.learningScore, simulationScore: row.simulationScore, assessmentScore: row.assessmentScore, readiness: row.readiness, status: row.status, updatedAt: row.updatedAt } : null;
      } catch {
        return null;
      }
    },

    async listLearnerProgress(organisationId, userId) {
      try {
        const rows = await db.select().from(schema.learnerProgress).where(and(eq(schema.learnerProgress.organisationId, organisationId), eq(schema.learnerProgress.userId, userId)));
        return rows.map((row) => ({ organisationId, userId, courseId: row.courseId, learningScore: row.learningScore, simulationScore: row.simulationScore, assessmentScore: row.assessmentScore, readiness: row.readiness, status: row.status, updatedAt: row.updatedAt }));
      } catch {
        return [];
      }
    },

    async upsertLearnerProgress(organisationId, userId, courseId, patch) {
      const timestamp = now();
      const existing = await this.getLearnerProgress(organisationId, userId, courseId);
      const merged = {
        learningScore: patch.learningScore ?? existing?.learningScore ?? 0,
        simulationScore: patch.simulationScore ?? existing?.simulationScore ?? 0,
        assessmentScore: patch.assessmentScore ?? existing?.assessmentScore ?? 0,
        readiness: patch.readiness ?? existing?.readiness ?? 0,
        status: patch.status ?? existing?.status ?? "in-progress",
      };
      if (existing) {
        await db.update(schema.learnerProgress).set({ ...merged, updatedAt: timestamp }).where(and(eq(schema.learnerProgress.organisationId, organisationId), eq(schema.learnerProgress.userId, userId), eq(schema.learnerProgress.courseId, courseId)));
      } else {
        await db.insert(schema.learnerProgress).values({ id: progressKey(organisationId, userId, courseId), organisationId, userId, courseId, ...merged, createdAt: timestamp, updatedAt: timestamp });
      }
      return { organisationId, userId, courseId, ...merged, updatedAt: timestamp };
    },

    async recordAttempt(attempt) {
      const timestamp = attempt.createdAt ?? now();
      const row = {
        id: attempt.id ?? crypto.randomUUID(),
        organisationId: attempt.organisationId,
        userId: attempt.userId,
        courseId: attempt.courseId,
        kind: attempt.kind,
        refId: attempt.refId ?? "",
        score: Math.round(attempt.score ?? 0),
        detailJson: JSON.stringify(attempt.detail ?? {}),
        createdAt: timestamp,
      };
      await db.insert(schema.learnerAttempts).values(row);
      return { ...row, detail: attempt.detail ?? {} };
    },

    async listAttempts(organisationId, userId, courseId) {
      try {
        const conditions = [eq(schema.learnerAttempts.organisationId, organisationId), eq(schema.learnerAttempts.userId, userId)];
        if (courseId) conditions.push(eq(schema.learnerAttempts.courseId, courseId));
        const rows = await db.select().from(schema.learnerAttempts).where(and(...conditions)).orderBy(desc(schema.learnerAttempts.createdAt));
        return rows.map((row) => ({ id: row.id, organisationId: row.organisationId, userId: row.userId, courseId: row.courseId, kind: row.kind, refId: row.refId, score: row.score, detail: parseObject(row.detailJson), createdAt: row.createdAt }));
      } catch {
        return [];
      }
    },

    async getCredential(organisationId, userId, courseId) {
      try {
        const rows = await db.select().from(schema.credentials).where(and(eq(schema.credentials.organisationId, organisationId), eq(schema.credentials.userId, userId), eq(schema.credentials.courseId, courseId))).limit(1);
        const row = rows[0];
        return row ? { id: row.id, organisationId, userId, courseId, learner: row.learner, programme: row.programme, readiness: row.readiness, breakdown: parseObject(row.breakdownJson), issuedAt: row.issuedAt } : null;
      } catch {
        return null;
      }
    },

    async listCredentials(organisationId, userId) {
      try {
        const rows = await db.select().from(schema.credentials).where(and(eq(schema.credentials.organisationId, organisationId), eq(schema.credentials.userId, userId))).orderBy(desc(schema.credentials.issuedAt));
        return rows.map((row) => ({ id: row.id, organisationId, userId, courseId: row.courseId, learner: row.learner, programme: row.programme, readiness: row.readiness, breakdown: parseObject(row.breakdownJson), issuedAt: row.issuedAt }));
      } catch {
        return [];
      }
    },

    async issueCredential(cred) {
      const timestamp = now();
      const existing = await this.getCredential(cred.organisationId, cred.userId, cred.courseId);
      const values = {
        learner: cred.learner ?? "",
        programme: cred.programme ?? "",
        readiness: Math.round(cred.readiness ?? 0),
        breakdownJson: JSON.stringify(cred.breakdown ?? {}),
        issuedAt: existing?.issuedAt ?? timestamp,
      };
      if (existing) {
        await db.update(schema.credentials).set({ ...values, updatedAt: timestamp }).where(and(eq(schema.credentials.organisationId, cred.organisationId), eq(schema.credentials.userId, cred.userId), eq(schema.credentials.courseId, cred.courseId)));
        return { ...existing, ...cred, readiness: values.readiness, breakdown: cred.breakdown ?? {}, issuedAt: values.issuedAt };
      }
      await db.insert(schema.credentials).values({ id: crypto.randomUUID(), organisationId: cred.organisationId, userId: cred.userId, courseId: cred.courseId, ...values, createdAt: timestamp, updatedAt: timestamp });
      return { organisationId: cred.organisationId, userId: cred.userId, courseId: cred.courseId, learner: values.learner, programme: values.programme, readiness: values.readiness, breakdown: cred.breakdown ?? {}, issuedAt: values.issuedAt };
    },
  };
}

// ---- Store resolution + bootstrap -----------------------------------

let memorySingleton = null;
let cachedDrizzle = null;
let cachedBinding = null;

// Resolve the active store for a request. Prefers D1 when the binding is
// available; otherwise a process-local in-memory store (shared across a
// single worker/dev process so writes are visible within the session).
export function getStore(env = {}) {
  const binding = env?.DB;
  if (binding) {
    try {
      if (cachedBinding !== binding || !cachedDrizzle) {
        cachedBinding = binding;
        cachedDrizzle = drizzle(binding, { schema });
      }
      return createD1Store(cachedDrizzle);
    } catch {
      // Fall through to the in-memory store if drizzle cannot bind.
    }
  }
  if (!memorySingleton) memorySingleton = createMemoryStore();
  return memorySingleton;
}

// Ensure a single bootstrap admin + organisation exists. Idempotent: only
// seeds when the users table is empty. Sources bootstrap admin credentials
// from ADMIN_* env/secrets, falling back to the committed owner admin record.

export async function ensureBootstrap(env = {}) {
  const store = getStore(env);
  if ((await store.countUsers()) > 0) return store;

  const email = String(env.ADMIN_EMAIL ?? OWNER_ADMIN.email).trim().toLowerCase();
  const displayName = String(env.ADMIN_NAME ?? OWNER_ADMIN.displayName);
  const orgName = String(env.ADMIN_ORG_NAME ?? "Amygdala");
  const credential = env.ADMIN_PASSWORD_SALT && env.ADMIN_PASSWORD_HASH
    ? { salt: String(env.ADMIN_PASSWORD_SALT), hash: String(env.ADMIN_PASSWORD_HASH), iterations: Number(env.ADMIN_PASSWORD_ITERATIONS ?? 100000) }
    : OWNER_ADMIN.credential;

  const organisationId = OWNER_ADMIN.organisationId;
  if (!(await store.getOrganisation(organisationId))) {
    await store.createOrganisation({ id: organisationId, name: orgName, type: "vendor" });
  }
  await store.createUser({ userId: OWNER_ADMIN.userId, email, displayName, organisationId, role: OWNER_ADMIN.role, credential });
  return store;
}
