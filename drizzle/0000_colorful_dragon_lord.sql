CREATE TABLE `ai_conversations` (
	`id` text PRIMARY KEY NOT NULL,
	`organisation_id` text NOT NULL,
	`assignment_id` text NOT NULL,
	`module_id` text,
	`mode` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_ai_conversations_tenant_assignment` ON `ai_conversations` (`organisation_id`,`assignment_id`);--> statement-breakpoint
CREATE TABLE `ai_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`organisation_id` text NOT NULL,
	`conversation_id` text NOT NULL,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`answer_status` text,
	`feedback` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_ai_messages_tenant_conversation` ON `ai_messages` (`organisation_id`,`conversation_id`);--> statement-breakpoint
CREATE TABLE `assessment_attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`organisation_id` text NOT NULL,
	`assessment_id` text NOT NULL,
	`assignment_id` text NOT NULL,
	`score` integer NOT NULL,
	`passed` integer NOT NULL,
	`answers_json` text NOT NULL,
	`completed_at` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_assessment_attempts_assignment` ON `assessment_attempts` (`assignment_id`,`assessment_id`);--> statement-breakpoint
CREATE TABLE `assessments` (
	`id` text PRIMARY KEY NOT NULL,
	`organisation_id` text NOT NULL,
	`programme_id` text NOT NULL,
	`title` text NOT NULL,
	`pass_threshold` integer NOT NULL,
	`questions_json` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_assessments_tenant_programme` ON `assessments` (`organisation_id`,`programme_id`);--> statement-breakpoint
CREATE TABLE `audit_events` (
	`id` text PRIMARY KEY NOT NULL,
	`organisation_id` text NOT NULL,
	`actor_membership_id` text,
	`event_type` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`detail_json` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_audit_events_tenant_created` ON `audit_events` (`organisation_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_audit_events_entity` ON `audit_events` (`entity_type`,`entity_id`);--> statement-breakpoint
CREATE TABLE `certificates` (
	`id` text PRIMARY KEY NOT NULL,
	`organisation_id` text NOT NULL,
	`assignment_id` text NOT NULL,
	`credential_code` text NOT NULL,
	`readiness_score` integer NOT NULL,
	`issued_at` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_certificates_credential_code` ON `certificates` (`credential_code`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_certificates_assignment` ON `certificates` (`assignment_id`);--> statement-breakpoint
CREATE TABLE `escalations` (
	`id` text PRIMARY KEY NOT NULL,
	`organisation_id` text NOT NULL,
	`ai_message_id` text NOT NULL,
	`assigned_membership_id` text,
	`status` text NOT NULL,
	`resolution` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_escalations_tenant_status` ON `escalations` (`organisation_id`,`status`);--> statement-breakpoint
CREATE TABLE `knowledge_chunks` (
	`id` text PRIMARY KEY NOT NULL,
	`organisation_id` text NOT NULL,
	`source_version_id` text NOT NULL,
	`section` text NOT NULL,
	`content` text NOT NULL,
	`token_count` integer NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_knowledge_chunks_tenant_source` ON `knowledge_chunks` (`organisation_id`,`source_version_id`);--> statement-breakpoint
CREATE TABLE `learner_assignments` (
	`id` text PRIMARY KEY NOT NULL,
	`organisation_id` text NOT NULL,
	`learner_membership_id` text NOT NULL,
	`programme_id` text NOT NULL,
	`pathway_level` text NOT NULL,
	`diagnostic_score` integer,
	`status` text NOT NULL,
	`assigned_at` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_assignments_tenant_learner` ON `learner_assignments` (`organisation_id`,`learner_membership_id`);--> statement-breakpoint
CREATE TABLE `learner_progress` (
	`id` text PRIMARY KEY NOT NULL,
	`organisation_id` text NOT NULL,
	`assignment_id` text NOT NULL,
	`module_id` text NOT NULL,
	`completion_percent` integer NOT NULL,
	`completed_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_progress_assignment_module` ON `learner_progress` (`assignment_id`,`module_id`);--> statement-breakpoint
CREATE TABLE `lessons` (
	`id` text PRIMARY KEY NOT NULL,
	`organisation_id` text NOT NULL,
	`module_id` text NOT NULL,
	`title` text NOT NULL,
	`content` text NOT NULL,
	`sequence` integer NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_lessons_module_sequence` ON `lessons` (`module_id`,`sequence`);--> statement-breakpoint
CREATE TABLE `memberships` (
	`id` text PRIMARY KEY NOT NULL,
	`organisation_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text NOT NULL,
	`status` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_memberships_organisation_user` ON `memberships` (`organisation_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `idx_memberships_user_id` ON `memberships` (`user_id`);--> statement-breakpoint
CREATE TABLE `organisations` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`vendor_organisation_id` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `products` (
	`id` text PRIMARY KEY NOT NULL,
	`organisation_id` text NOT NULL,
	`name` text NOT NULL,
	`current_version` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_products_organisation_id` ON `products` (`organisation_id`);--> statement-breakpoint
CREATE TABLE `simulation_attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`organisation_id` text NOT NULL,
	`simulation_id` text NOT NULL,
	`assignment_id` text NOT NULL,
	`attempt_number` integer NOT NULL,
	`error_count` integer NOT NULL,
	`competency_score` integer NOT NULL,
	`completed_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_simulation_attempts_assignment` ON `simulation_attempts` (`assignment_id`,`simulation_id`);--> statement-breakpoint
CREATE TABLE `simulations` (
	`id` text PRIMARY KEY NOT NULL,
	`organisation_id` text NOT NULL,
	`module_id` text NOT NULL,
	`title` text NOT NULL,
	`definition_json` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_simulations_tenant_module` ON `simulations` (`organisation_id`,`module_id`);--> statement-breakpoint
CREATE TABLE `source_citations` (
	`id` text PRIMARY KEY NOT NULL,
	`organisation_id` text NOT NULL,
	`ai_message_id` text NOT NULL,
	`source_version_id` text NOT NULL,
	`knowledge_chunk_id` text NOT NULL,
	`section` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_citations_message` ON `source_citations` (`ai_message_id`);--> statement-breakpoint
CREATE INDEX `idx_citations_tenant_source` ON `source_citations` (`organisation_id`,`source_version_id`);--> statement-breakpoint
CREATE TABLE `source_documents` (
	`id` text PRIMARY KEY NOT NULL,
	`organisation_id` text NOT NULL,
	`product_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text NOT NULL,
	`module` text NOT NULL,
	`intended_role` text NOT NULL,
	`content_owner` text NOT NULL,
	`source_type` text NOT NULL,
	`storage_key` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_source_documents_organisation_product` ON `source_documents` (`organisation_id`,`product_id`);--> statement-breakpoint
CREATE TABLE `source_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`organisation_id` text NOT NULL,
	`source_document_id` text NOT NULL,
	`version` text NOT NULL,
	`status` text NOT NULL,
	`approval_status` text NOT NULL,
	`effective_date` text,
	`extracted_text` text NOT NULL,
	`approved_by_membership_id` text,
	`approved_at` text,
	`published_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_source_versions_document_status` ON `source_versions` (`source_document_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_source_versions_tenant_approval` ON `source_versions` (`organisation_id`,`approval_status`,`status`);--> statement-breakpoint
CREATE TABLE `training_modules` (
	`id` text PRIMARY KEY NOT NULL,
	`organisation_id` text NOT NULL,
	`programme_id` text NOT NULL,
	`title` text NOT NULL,
	`objective` text NOT NULL,
	`sequence` integer NOT NULL,
	`mandatory` integer NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_modules_programme_sequence` ON `training_modules` (`programme_id`,`sequence`);--> statement-breakpoint
CREATE TABLE `training_programmes` (
	`id` text PRIMARY KEY NOT NULL,
	`organisation_id` text NOT NULL,
	`product_id` text NOT NULL,
	`title` text NOT NULL,
	`role` text NOT NULL,
	`status` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_programmes_organisation_product` ON `training_programmes` (`organisation_id`,`product_id`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`external_identity_hash` text NOT NULL,
	`display_name` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_users_external_identity_hash` ON `users` (`external_identity_hash`);--> statement-breakpoint
PRAGMA optimize;
