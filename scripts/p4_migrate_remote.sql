-- Phase 4 migration — Workstream B (learner management).
-- Apply ONCE to the remote D1 `amygdala-db` BEFORE deploying the Phase 4 code:
--   CLOUDFLARE_API_TOKEN="${CLOUDFLARE_API_TOKEN:-$Cloudflare_API_Token}" \
--   CLOUDFLARE_ACCOUNT_ID="${CLOUDFLARE_ACCOUNT_ID:-$Cloudflare_Account_ID}" \
--   npx wrangler d1 execute amygdala-db --remote --file=scripts/p4_migrate_remote.sql
--
-- Additive + idempotent (CREATE TABLE IF NOT EXISTS). The store tolerates a
-- pre-migration state (reads of these tables fall back to safe defaults), so
-- deploying before migrating degrades gracefully.

CREATE TABLE IF NOT EXISTS `user_profiles` (
	`user_id` text PRIMARY KEY NOT NULL,
	`organisation_id` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`mfa_secret` text DEFAULT '' NOT NULL,
	`mfa_enabled` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
CREATE INDEX IF NOT EXISTS `idx_user_profiles_org` ON `user_profiles` (`organisation_id`);

CREATE TABLE IF NOT EXISTS `custom_roles` (
	`id` text PRIMARY KEY NOT NULL,
	`organisation_id` text NOT NULL,
	`name` text NOT NULL,
	`capabilities_json` text DEFAULT '[]' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS `idx_custom_roles_org_name` ON `custom_roles` (`organisation_id`,`name`);

CREATE TABLE IF NOT EXISTS `cohorts` (
	`id` text PRIMARY KEY NOT NULL,
	`organisation_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`auto_enrol_role` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
CREATE INDEX IF NOT EXISTS `idx_cohorts_org` ON `cohorts` (`organisation_id`);

CREATE TABLE IF NOT EXISTS `cohort_members` (
	`id` text PRIMARY KEY NOT NULL,
	`organisation_id` text NOT NULL,
	`cohort_id` text NOT NULL,
	`user_id` text NOT NULL,
	`created_at` text NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS `idx_cohort_members_key` ON `cohort_members` (`cohort_id`,`user_id`);

CREATE TABLE IF NOT EXISTS `assignments` (
	`id` text PRIMARY KEY NOT NULL,
	`organisation_id` text NOT NULL,
	`target_type` text NOT NULL,
	`target_id` text NOT NULL,
	`course_id` text NOT NULL,
	`due_date` text,
	`required` integer DEFAULT 1 NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`created_by` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
CREATE INDEX IF NOT EXISTS `idx_assignments_org` ON `assignments` (`organisation_id`);

CREATE TABLE IF NOT EXISTS `notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`organisation_id` text NOT NULL,
	`user_id` text NOT NULL,
	`kind` text DEFAULT 'info' NOT NULL,
	`title` text DEFAULT '' NOT NULL,
	`body` text DEFAULT '' NOT NULL,
	`read_at` text,
	`created_at` text NOT NULL
);
CREATE INDEX IF NOT EXISTS `idx_notifications_user` ON `notifications` (`organisation_id`,`user_id`);

CREATE TABLE IF NOT EXISTS `provisioning_config` (
	`organisation_id` text PRIMARY KEY NOT NULL,
	`sso_enabled` integer DEFAULT 0 NOT NULL,
	`scim_enabled` integer DEFAULT 0 NOT NULL,
	`allowed_domains_json` text DEFAULT '[]' NOT NULL,
	`group_role_map_json` text DEFAULT '{}' NOT NULL,
	`default_role` text DEFAULT 'Learner' NOT NULL,
	`scim_token_hash` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
