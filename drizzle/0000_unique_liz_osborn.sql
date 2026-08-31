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
--> statement-breakpoint
CREATE INDEX `idx_audit_events_org_created` ON `audit_events` (`organisation_id`,`created_at`);--> statement-breakpoint
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
--> statement-breakpoint
CREATE INDEX `idx_courses_org_status` ON `courses` (`organisation_id`,`status`);--> statement-breakpoint
CREATE TABLE `organisations` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`type` text DEFAULT 'vendor' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
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
--> statement-breakpoint
CREATE INDEX `idx_sources_org_status` ON `sources` (`organisation_id`,`status`);--> statement-breakpoint
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
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_users_email` ON `users` (`email`);