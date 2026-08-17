import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

const timestamps = {
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
};

export const organisations = sqliteTable("organisations", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  type: text("type", { enum: ["vendor", "customer"] }).notNull(),
  vendorOrganisationId: text("vendor_organisation_id"),
  ...timestamps,
});

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  externalIdentityHash: text("external_identity_hash").notNull(),
  displayName: text("display_name").notNull(),
  ...timestamps,
}, (table) => [uniqueIndex("idx_users_external_identity_hash").on(table.externalIdentityHash)]);

export const memberships = sqliteTable("memberships", {
  id: text("id").primaryKey(),
  organisationId: text("organisation_id").notNull(),
  userId: text("user_id").notNull(),
  role: text("role").notNull(),
  status: text("status").notNull(),
  ...timestamps,
}, (table) => [uniqueIndex("idx_memberships_organisation_user").on(table.organisationId, table.userId), index("idx_memberships_user_id").on(table.userId)]);

export const products = sqliteTable("products", {
  id: text("id").primaryKey(),
  organisationId: text("organisation_id").notNull(),
  name: text("name").notNull(),
  currentVersion: text("current_version").notNull(),
  ...timestamps,
}, (table) => [index("idx_products_organisation_id").on(table.organisationId)]);

export const sourceDocuments = sqliteTable("source_documents", {
  id: text("id").primaryKey(),
  organisationId: text("organisation_id").notNull(),
  productId: text("product_id").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  module: text("module").notNull(),
  intendedRole: text("intended_role").notNull(),
  contentOwner: text("content_owner").notNull(),
  sourceType: text("source_type").notNull(),
  storageKey: text("storage_key"),
  ...timestamps,
}, (table) => [index("idx_source_documents_organisation_product").on(table.organisationId, table.productId)]);

export const sourceVersions = sqliteTable("source_versions", {
  id: text("id").primaryKey(),
  organisationId: text("organisation_id").notNull(),
  sourceDocumentId: text("source_document_id").notNull(),
  version: text("version").notNull(),
  status: text("status").notNull(),
  approvalStatus: text("approval_status").notNull(),
  effectiveDate: text("effective_date"),
  extractedText: text("extracted_text").notNull(),
  approvedByMembershipId: text("approved_by_membership_id"),
  approvedAt: text("approved_at"),
  publishedAt: text("published_at"),
  ...timestamps,
}, (table) => [index("idx_source_versions_document_status").on(table.sourceDocumentId, table.status), index("idx_source_versions_tenant_approval").on(table.organisationId, table.approvalStatus, table.status)]);

export const knowledgeChunks = sqliteTable("knowledge_chunks", {
  id: text("id").primaryKey(),
  organisationId: text("organisation_id").notNull(),
  sourceVersionId: text("source_version_id").notNull(),
  section: text("section").notNull(),
  content: text("content").notNull(),
  tokenCount: integer("token_count").notNull(),
  ...timestamps,
}, (table) => [index("idx_knowledge_chunks_tenant_source").on(table.organisationId, table.sourceVersionId)]);

export const trainingProgrammes = sqliteTable("training_programmes", {
  id: text("id").primaryKey(), organisationId: text("organisation_id").notNull(), productId: text("product_id").notNull(), title: text("title").notNull(), role: text("role").notNull(), status: text("status").notNull(), ...timestamps,
}, (table) => [index("idx_programmes_organisation_product").on(table.organisationId, table.productId)]);

export const trainingModules = sqliteTable("training_modules", {
  id: text("id").primaryKey(), organisationId: text("organisation_id").notNull(), programmeId: text("programme_id").notNull(), title: text("title").notNull(), objective: text("objective").notNull(), sequence: integer("sequence").notNull(), mandatory: integer("mandatory", { mode: "boolean" }).notNull(), ...timestamps,
}, (table) => [index("idx_modules_programme_sequence").on(table.programmeId, table.sequence)]);

export const lessons = sqliteTable("lessons", {
  id: text("id").primaryKey(), organisationId: text("organisation_id").notNull(), moduleId: text("module_id").notNull(), title: text("title").notNull(), content: text("content").notNull(), sequence: integer("sequence").notNull(), ...timestamps,
}, (table) => [index("idx_lessons_module_sequence").on(table.moduleId, table.sequence)]);

export const learnerAssignments = sqliteTable("learner_assignments", {
  id: text("id").primaryKey(), organisationId: text("organisation_id").notNull(), learnerMembershipId: text("learner_membership_id").notNull(), programmeId: text("programme_id").notNull(), pathwayLevel: text("pathway_level").notNull(), diagnosticScore: integer("diagnostic_score"), status: text("status").notNull(), assignedAt: text("assigned_at").notNull(), ...timestamps,
}, (table) => [index("idx_assignments_tenant_learner").on(table.organisationId, table.learnerMembershipId)]);

export const learnerProgress = sqliteTable("learner_progress", {
  id: text("id").primaryKey(), organisationId: text("organisation_id").notNull(), assignmentId: text("assignment_id").notNull(), moduleId: text("module_id").notNull(), completionPercent: integer("completion_percent").notNull(), completedAt: text("completed_at"), ...timestamps,
}, (table) => [uniqueIndex("idx_progress_assignment_module").on(table.assignmentId, table.moduleId)]);

export const simulations = sqliteTable("simulations", {
  id: text("id").primaryKey(), organisationId: text("organisation_id").notNull(), moduleId: text("module_id").notNull(), title: text("title").notNull(), definitionJson: text("definition_json").notNull(), ...timestamps,
}, (table) => [index("idx_simulations_tenant_module").on(table.organisationId, table.moduleId)]);

export const simulationAttempts = sqliteTable("simulation_attempts", {
  id: text("id").primaryKey(), organisationId: text("organisation_id").notNull(), simulationId: text("simulation_id").notNull(), assignmentId: text("assignment_id").notNull(), attemptNumber: integer("attempt_number").notNull(), errorCount: integer("error_count").notNull(), competencyScore: integer("competency_score").notNull(), completedAt: text("completed_at"), ...timestamps,
}, (table) => [index("idx_simulation_attempts_assignment").on(table.assignmentId, table.simulationId)]);

export const assessments = sqliteTable("assessments", {
  id: text("id").primaryKey(), organisationId: text("organisation_id").notNull(), programmeId: text("programme_id").notNull(), title: text("title").notNull(), passThreshold: integer("pass_threshold").notNull(), questionsJson: text("questions_json").notNull(), ...timestamps,
}, (table) => [index("idx_assessments_tenant_programme").on(table.organisationId, table.programmeId)]);

export const assessmentAttempts = sqliteTable("assessment_attempts", {
  id: text("id").primaryKey(), organisationId: text("organisation_id").notNull(), assessmentId: text("assessment_id").notNull(), assignmentId: text("assignment_id").notNull(), score: integer("score").notNull(), passed: integer("passed", { mode: "boolean" }).notNull(), answersJson: text("answers_json").notNull(), completedAt: text("completed_at").notNull(), ...timestamps,
}, (table) => [index("idx_assessment_attempts_assignment").on(table.assignmentId, table.assessmentId)]);

export const aiConversations = sqliteTable("ai_conversations", {
  id: text("id").primaryKey(), organisationId: text("organisation_id").notNull(), assignmentId: text("assignment_id").notNull(), moduleId: text("module_id"), mode: text("mode").notNull(), ...timestamps,
}, (table) => [index("idx_ai_conversations_tenant_assignment").on(table.organisationId, table.assignmentId)]);

export const aiMessages = sqliteTable("ai_messages", {
  id: text("id").primaryKey(), organisationId: text("organisation_id").notNull(), conversationId: text("conversation_id").notNull(), role: text("role").notNull(), content: text("content").notNull(), answerStatus: text("answer_status"), feedback: text("feedback"), createdAt: text("created_at").notNull(),
}, (table) => [index("idx_ai_messages_tenant_conversation").on(table.organisationId, table.conversationId)]);

export const sourceCitations = sqliteTable("source_citations", {
  id: text("id").primaryKey(), organisationId: text("organisation_id").notNull(), aiMessageId: text("ai_message_id").notNull(), sourceVersionId: text("source_version_id").notNull(), knowledgeChunkId: text("knowledge_chunk_id").notNull(), section: text("section").notNull(), createdAt: text("created_at").notNull(),
}, (table) => [index("idx_citations_message").on(table.aiMessageId), index("idx_citations_tenant_source").on(table.organisationId, table.sourceVersionId)]);

export const escalations = sqliteTable("escalations", {
  id: text("id").primaryKey(), organisationId: text("organisation_id").notNull(), aiMessageId: text("ai_message_id").notNull(), assignedMembershipId: text("assigned_membership_id"), status: text("status").notNull(), resolution: text("resolution"), ...timestamps,
}, (table) => [index("idx_escalations_tenant_status").on(table.organisationId, table.status)]);

export const certificates = sqliteTable("certificates", {
  id: text("id").primaryKey(), organisationId: text("organisation_id").notNull(), assignmentId: text("assignment_id").notNull(), credentialCode: text("credential_code").notNull(), readinessScore: integer("readiness_score").notNull(), issuedAt: text("issued_at").notNull(), ...timestamps,
}, (table) => [uniqueIndex("idx_certificates_credential_code").on(table.credentialCode), uniqueIndex("idx_certificates_assignment").on(table.assignmentId)]);

export const auditEvents = sqliteTable("audit_events", {
  id: text("id").primaryKey(), organisationId: text("organisation_id").notNull(), actorMembershipId: text("actor_membership_id"), eventType: text("event_type").notNull(), entityType: text("entity_type").notNull(), entityId: text("entity_id").notNull(), detailJson: text("detail_json").notNull(), createdAt: text("created_at").notNull(),
}, (table) => [index("idx_audit_events_tenant_created").on(table.organisationId, table.createdAt), index("idx_audit_events_entity").on(table.entityType, table.entityId)]);
