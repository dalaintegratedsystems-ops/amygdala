import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

// Phase 0 schema: a small, purpose-built set of tables for exactly the
// entities the live flows persist. Everything starts EMPTY — no seed content.

const timestamps = {
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
};

// A tenant workspace (the vendor creating onboarding).
export const organisations = sqliteTable("organisations", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  type: text("type").notNull().default("vendor"),
  ...timestamps,
});

// Authenticated users with PBKDF2 credentials, scoped to one organisation.
export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  displayName: text("display_name").notNull(),
  organisationId: text("organisation_id").notNull(),
  role: text("role").notNull(),
  salt: text("salt").notNull(),
  hash: text("hash").notNull(),
  iterations: integer("iterations").notNull(),
  ...timestamps,
}, (table) => [uniqueIndex("idx_users_email").on(table.email)]);

// An uploaded / ingested source document plus its span-verified derived
// knowledge (explanation, procedure, keywords) stored as JSON.
export const sources = sqliteTable("sources", {
  id: text("id").primaryKey(),
  organisationId: text("organisation_id").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  product: text("product").notNull().default(""),
  module: text("module").notNull().default(""),
  intendedRole: text("intended_role").notNull().default("All roles"),
  contentOwner: text("content_owner").notNull().default(""),
  type: text("type").notNull().default("Document"),
  version: text("version").notNull().default("1.0"),
  status: text("status").notNull().default("Draft"),
  approvalStatus: text("approval_status").notNull().default("Pending"),
  section: text("section").notNull().default(""),
  storageKey: text("storage_key"),
  extractedText: text("extracted_text").notNull().default(""),
  explanation: text("explanation").notNull().default(""),
  procedureJson: text("procedure_json").notNull().default("[]"),
  keywordsJson: text("keywords_json").notNull().default("[]"),
  // Whole-document knowledge for large-document handling: { documentType,
  // outline, coverage }. JSON blob so the schema stays small and the store
  // can tolerate its absence during rollout.
  knowledgeJson: text("knowledge_json").notNull().default("{}"),
  uploadDate: text("upload_date"),
  effectiveDate: text("effective_date"),
  ...timestamps,
}, (table) => [index("idx_sources_org_status").on(table.organisationId, table.status)]);

// A generated course (programme + modules + lessons + assessment +
// simulation), stored as JSON and linked back to its grounding source.
export const courses = sqliteTable("courses", {
  id: text("id").primaryKey(),
  organisationId: text("organisation_id").notNull(),
  sourceId: text("source_id").notNull(),
  title: text("title").notNull(),
  role: text("role").notNull().default(""),
  status: text("status").notNull().default("Draft"),
  approvalStatus: text("approval_status").notNull().default("Pending"),
  courseJson: text("course_json").notNull(),
  ...timestamps,
}, (table) => [index("idx_courses_org_status").on(table.organisationId, table.status)]);

// Per-workspace brand kit (logo, colours, font) applied through the app's CSS
// custom properties. One row per organisation.
export const brandKits = sqliteTable("brand_kits", {
  organisationId: text("organisation_id").primaryKey(),
  workspaceName: text("workspace_name").notNull().default(""),
  logoKey: text("logo_key"),
  primaryColor: text("primary_color").notNull().default(""),
  accentColor: text("accent_color").notNull().default(""),
  fontFamily: text("font_family").notNull().default(""),
  ...timestamps,
});

// A vendor SaaS simulation definition: an authored guided overlay on top of
// either an embedded sandbox URL (iframe) or a set of uploaded screenshots
// (DOM-capture fallback). Steps are ordered hotspots + coaching. Everything
// is a JSON blob so the schema stays small and tolerant during rollout.
export const simulations = sqliteTable("simulations", {
  id: text("id").primaryKey(),
  organisationId: text("organisation_id").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  // "iframe" (embed a sandbox URL) or "screenshot" (guided walkthrough over
  // author-uploaded screens). Never points at a production system.
  mode: text("mode").notNull().default("iframe"),
  targetUrl: text("target_url").notNull().default(""),
  // Cached embeddability probe result (0/1). Non-embeddable targets fall back
  // to the screenshot walkthrough.
  embeddable: integer("embeddable").notNull().default(1),
  // Optional postMessage bridge for real step detection when the vendor
  // cooperates; otherwise the learner advances steps manually.
  bridgeEnabled: integer("bridge_enabled").notNull().default(0),
  status: text("status").notNull().default("Draft"),
  // Ordered steps: [{ id, label, coaching, hotspot:{ x, y, w, h }, screenIndex,
  //   match:{ event } }].
  stepsJson: text("steps_json").notNull().default("[]"),
  // Screenshot-fallback screens: [{ key, alt, width, height }].
  screensJson: text("screens_json").notNull().default("[]"),
  ...timestamps,
}, (table) => [index("idx_simulations_org").on(table.organisationId, table.status)]);

// Per-workspace allow-list of origins that may be embedded in the simulator.
// The simulator refuses to embed any origin not on this list.
export const simOrigins = sqliteTable("sim_origins", {
  id: text("id").primaryKey(),
  organisationId: text("organisation_id").notNull(),
  origin: text("origin").notNull(),
  label: text("label").notNull().default(""),
  createdAt: text("created_at").notNull(),
}, (table) => [uniqueIndex("idx_sim_origins_org_origin").on(table.organisationId, table.origin)]);

// Per-learner progress for a course. The signed-in user is the learner; this
// single row survives reload and holds the latest component scores + the
// derived readiness. One row per (organisation, user, course).
export const learnerProgress = sqliteTable("learner_progress", {
  id: text("id").primaryKey(),
  organisationId: text("organisation_id").notNull(),
  userId: text("user_id").notNull(),
  courseId: text("course_id").notNull(),
  learningScore: integer("learning_score").notNull().default(0),
  simulationScore: integer("simulation_score").notNull().default(0),
  assessmentScore: integer("assessment_score").notNull().default(0),
  readiness: integer("readiness").notNull().default(0),
  status: text("status").notNull().default("in-progress"),
  ...timestamps,
}, (table) => [uniqueIndex("idx_learner_progress_key").on(table.organisationId, table.userId, table.courseId)]);

// Append-only record of individual simulation / assessment attempts.
export const learnerAttempts = sqliteTable("learner_attempts", {
  id: text("id").primaryKey(),
  organisationId: text("organisation_id").notNull(),
  userId: text("user_id").notNull(),
  courseId: text("course_id").notNull(),
  kind: text("kind").notNull(),
  refId: text("ref_id").notNull().default(""),
  score: integer("score").notNull().default(0),
  detailJson: text("detail_json").notNull().default("{}"),
  createdAt: text("created_at").notNull(),
}, (table) => [index("idx_learner_attempts_key").on(table.organisationId, table.userId, table.courseId)]);

// Issued readiness credentials, one per (organisation, user, course).
export const credentials = sqliteTable("credentials", {
  id: text("id").primaryKey(),
  organisationId: text("organisation_id").notNull(),
  userId: text("user_id").notNull(),
  courseId: text("course_id").notNull(),
  learner: text("learner").notNull().default(""),
  programme: text("programme").notNull().default(""),
  readiness: integer("readiness").notNull().default(0),
  breakdownJson: text("breakdown_json").notNull().default("{}"),
  issuedAt: text("issued_at").notNull(),
  ...timestamps,
}, (table) => [uniqueIndex("idx_credentials_key").on(table.organisationId, table.userId, table.courseId)]);

// Append-only, tenant-scoped audit trail.
export const auditEvents = sqliteTable("audit_events", {
  id: text("id").primaryKey(),
  organisationId: text("organisation_id").notNull(),
  actor: text("actor"),
  role: text("role"),
  eventType: text("event_type").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  detail: text("detail").notNull().default(""),
  createdAt: text("created_at").notNull(),
}, (table) => [index("idx_audit_events_org_created").on(table.organisationId, table.createdAt)]);
