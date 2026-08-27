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

function now() {
  return new Date().toISOString();
}

function parseArray(value) {
  try {
    const parsed = JSON.parse(value ?? "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// Map a persisted source row to the flat shape the domain/authoring functions
// expect (procedure/keywords as arrays).
function rowToSource(row) {
  return {
    id: row.id,
    organisationId: row.organisationId,
    title: row.title,
    description: row.description,
    product: row.product,
    module: row.module,
    intendedRole: row.intendedRole,
    contentOwner: row.contentOwner,
    type: row.type,
    version: row.version,
    status: row.status,
    approvalStatus: row.approvalStatus,
    section: row.section,
    storageKey: row.storageKey ?? null,
    extractedText: row.extractedText,
    explanation: row.explanation,
    procedure: parseArray(row.procedureJson),
    keywords: parseArray(row.keywordsJson),
    uploadDate: row.uploadDate ?? null,
    effectiveDate: row.effectiveDate ?? null,
  };
}

function sourceToRow(source, timestamp) {
  return {
    id: source.id,
    organisationId: source.organisationId,
    title: source.title ?? "Untitled source",
    description: source.description ?? "",
    product: source.product ?? "",
    module: source.module ?? "",
    intendedRole: source.intendedRole ?? "All roles",
    contentOwner: source.contentOwner ?? "",
    type: source.type ?? "Document",
    version: source.version ?? "1.0",
    status: source.status ?? "Draft",
    approvalStatus: source.approvalStatus ?? "Pending",
    section: source.section ?? "",
    storageKey: source.storageKey ?? null,
    extractedText: source.extractedText ?? "",
    explanation: source.explanation ?? "",
    procedureJson: JSON.stringify(Array.isArray(source.procedure) ? source.procedure : []),
    keywordsJson: JSON.stringify(Array.isArray(source.keywords) ? source.keywords : []),
    uploadDate: source.uploadDate ?? null,
    effectiveDate: source.effectiveDate ?? null,
    createdAt: source.createdAt ?? timestamp,
    updatedAt: timestamp,
  };
}

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
  };
}

// ---- In-memory implementation ---------------------------------------

function createMemoryStore() {
  const data = {
    organisations: new Map(),
    users: new Map(),
    sources: new Map(),
    courses: new Map(),
    audit: [],
  };

  return {
    backend: "memory",

    async findUserByEmail(email) {
      const normalised = String(email ?? "").trim().toLowerCase();
      for (const user of data.users.values()) {
        if (user.email.toLowerCase() === normalised) return { ...user };
      }
      return null;
    },

    async countUsers() {
      return data.users.size;
    },

    async createOrganisation(org) {
      const record = { id: org.id, name: org.name, type: org.type ?? "vendor" };
      data.organisations.set(org.id, record);
      return record;
    },

    async getOrganisation(id) {
      return data.organisations.get(id) ?? null;
    },

    async createUser(user) {
      const record = { userId: user.userId, email: String(user.email).trim().toLowerCase(), displayName: user.displayName, organisationId: user.organisationId, role: user.role, credential: { ...user.credential } };
      data.users.set(user.userId, record);
      return user;
    },

    async listSources(organisationId, { status } = {}) {
      return [...data.sources.values()]
        .filter((source) => source.organisationId === organisationId && (!status || source.status === status))
        .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""))
        .map((source) => ({ ...source, procedure: [...source.procedure], keywords: [...source.keywords] }));
    },

    async listApprovedSources(organisationId) {
      return [...data.sources.values()]
        .filter((source) => source.organisationId === organisationId && source.status === "Published" && source.approvalStatus === "Approved")
        .map((source) => ({ ...source, procedure: [...source.procedure], keywords: [...source.keywords] }));
    },

    async getSource(organisationId, id) {
      const source = data.sources.get(id);
      if (!source || source.organisationId !== organisationId) return null;
      return { ...source, procedure: [...source.procedure], keywords: [...source.keywords] };
    },

    async createSource(source) {
      const timestamp = now();
      const record = { ...rowToSource(sourceToRow(source, timestamp)), createdAt: source.createdAt ?? timestamp };
      data.sources.set(record.id, record);
      return { ...record };
    },

    async updateSource(organisationId, id, patch) {
      const source = data.sources.get(id);
      if (!source || source.organisationId !== organisationId) return null;
      const updated = { ...source };
      for (const key of ["title", "description", "product", "module", "intendedRole", "contentOwner", "type", "version", "status", "approvalStatus", "section", "storageKey", "extractedText", "explanation", "uploadDate", "effectiveDate", "procedure", "keywords"]) {
        if (patch[key] !== undefined) updated[key] = patch[key];
      }
      data.sources.set(id, updated);
      return { ...updated };
    },

    async createCourse(course) {
      const timestamp = now();
      const record = { id: course.id, organisationId: course.organisationId, sourceId: course.sourceId, title: course.title, role: course.role ?? "", status: course.status ?? "Draft", approvalStatus: course.approvalStatus ?? "Pending", course: course.course, createdAt: timestamp };
      data.courses.set(record.id, record);
      return { ...record };
    },

    async listCourses(organisationId, { status } = {}) {
      return [...data.courses.values()]
        .filter((course) => course.organisationId === organisationId && (!status || course.status === status))
        .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""))
        .map((course) => ({ ...course }));
    },

    async getCourse(organisationId, id) {
      const course = data.courses.get(id);
      if (!course || course.organisationId !== organisationId) return null;
      return { ...course };
    },

    async findCourseBySource(organisationId, sourceId) {
      for (const course of data.courses.values()) {
        if (course.organisationId === organisationId && course.sourceId === sourceId) return { ...course };
      }
      return null;
    },

    async updateCourse(organisationId, id, patch) {
      const course = data.courses.get(id);
      if (!course || course.organisationId !== organisationId) return null;
      const updated = { ...course };
      for (const key of ["title", "role", "status", "approvalStatus", "course"]) {
        if (patch[key] !== undefined) updated[key] = patch[key];
      }
      data.courses.set(id, updated);
      return { ...updated };
    },

    async recordAudit(event) {
      const record = { id: event.id ?? crypto.randomUUID(), organisationId: event.organisationId, actor: event.actor ?? null, role: event.role ?? null, eventType: event.eventType, entityType: event.entityType, entityId: event.entityId, detail: event.detail ?? "", createdAt: event.createdAt ?? now() };
      data.audit.push(record);
      return record;
    },

    async listAudit(organisationId) {
      return data.audit.filter((event) => event.organisationId === organisationId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((event) => ({ ...event }));
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
const OWNER_ADMIN = {
  userId: "usr-admin",
  email: "admin@amygdalalishay.com",
  displayName: "Site Administrator",
  role: "Vendor Administrator",
  organisationId: "org-primary",
  credential: { salt: "70546e0164b462d9c8c2489e2764e338", iterations: 100000, hash: "9b112b51bc627d93746c2c23248c2146557f067d7b6843c814589dc87c5afd27" },
};

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
