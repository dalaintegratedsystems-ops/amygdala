-- One-off P0 reset: drop the empty aspirational schema and create the
-- focused P0 schema. Safe because all old tables are empty (verified).
DROP TABLE IF EXISTS ai_messages;
DROP TABLE IF EXISTS ai_conversations;
DROP TABLE IF EXISTS assessment_attempts;
DROP TABLE IF EXISTS assessments;
DROP TABLE IF EXISTS certificates;
DROP TABLE IF EXISTS escalations;
DROP TABLE IF EXISTS knowledge_chunks;
DROP TABLE IF EXISTS learner_assignments;
DROP TABLE IF EXISTS learner_progress;
DROP TABLE IF EXISTS lessons;
DROP TABLE IF EXISTS memberships;
DROP TABLE IF EXISTS products;
DROP TABLE IF EXISTS simulation_attempts;
DROP TABLE IF EXISTS simulations;
DROP TABLE IF EXISTS source_citations;
DROP TABLE IF EXISTS source_versions;
DROP TABLE IF EXISTS source_documents;
DROP TABLE IF EXISTS training_modules;
DROP TABLE IF EXISTS training_programmes;
DROP TABLE IF EXISTS audit_events;
DROP TABLE IF EXISTS courses;
DROP TABLE IF EXISTS sources;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS organisations;

CREATE TABLE `audit_events` (
	`id` text PRIMARY KEY NOT NULL,
	`organisation_id` text NOT NULL,
	`actor` text,
	`role` text,
	`event_type` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`detail` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL
);
CREATE INDEX `idx_audit_events_org_created` ON `audit_events` (`organisation_id`,`created_at`);
CREATE TABLE `courses` (
	`id` text PRIMARY KEY NOT NULL,
	`organisation_id` text NOT NULL,
	`source_id` text NOT NULL,
	`title` text NOT NULL,
	`role` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'Draft' NOT NULL,
	`approval_status` text DEFAULT 'Pending' NOT NULL,
	`course_json` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
CREATE INDEX `idx_courses_org_status` ON `courses` (`organisation_id`,`status`);
CREATE TABLE `organisations` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`type` text DEFAULT 'vendor' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
CREATE TABLE `sources` (
	`id` text PRIMARY KEY NOT NULL,
	`organisation_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`product` text DEFAULT '' NOT NULL,
	`module` text DEFAULT '' NOT NULL,
	`intended_role` text DEFAULT 'All roles' NOT NULL,
	`content_owner` text DEFAULT '' NOT NULL,
	`type` text DEFAULT 'Document' NOT NULL,
	`version` text DEFAULT '1.0' NOT NULL,
	`status` text DEFAULT 'Draft' NOT NULL,
	`approval_status` text DEFAULT 'Pending' NOT NULL,
	`section` text DEFAULT '' NOT NULL,
	`storage_key` text,
	`extracted_text` text DEFAULT '' NOT NULL,
	`explanation` text DEFAULT '' NOT NULL,
	`procedure_json` text DEFAULT '[]' NOT NULL,
	`keywords_json` text DEFAULT '[]' NOT NULL,
	`upload_date` text,
	`effective_date` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
CREATE INDEX `idx_sources_org_status` ON `sources` (`organisation_id`,`status`);
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`display_name` text NOT NULL,
	`organisation_id` text NOT NULL,
	`role` text NOT NULL,
	`salt` text NOT NULL,
	`hash` text NOT NULL,
	`iterations` integer NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
CREATE UNIQUE INDEX `idx_users_email` ON `users` (`email`);
