-- Phase 2 migration (apply once to the remote D1 `amygdala-db`).
-- `npm run deploy` does NOT apply migrations, so run this BEFORE deploying the
-- Phase 2 code:
--   CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ACCOUNT_ID=... \
--   npx wrangler d1 execute amygdala-db --remote --file=scripts/p2_migrate_remote.sql
--
-- All statements are additive + idempotent (CREATE TABLE IF NOT EXISTS). The
-- store also tolerates a pre-migration state (reads of these tables fall back
-- to empty), so deploying before migrating degrades gracefully rather than
-- erroring — but simulation/learner writes require these tables.

-- 1) Vendor SaaS simulation definitions (iframe embed or screenshot fallback).
CREATE TABLE IF NOT EXISTS `simulations` (
	`id` text PRIMARY KEY NOT NULL,
	`organisation_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`mode` text DEFAULT 'iframe' NOT NULL,
	`target_url` text DEFAULT '' NOT NULL,
	`embeddable` integer DEFAULT 1 NOT NULL,
	`bridge_enabled` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'Draft' NOT NULL,
	`steps_json` text DEFAULT '[]' NOT NULL,
	`screens_json` text DEFAULT '[]' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
CREATE INDEX IF NOT EXISTS `idx_simulations_org` ON `simulations` (`organisation_id`,`status`);

-- 2) Per-workspace allow-list of origins embeddable in the simulator.
CREATE TABLE IF NOT EXISTS `sim_origins` (
	`id` text PRIMARY KEY NOT NULL,
	`organisation_id` text NOT NULL,
	`origin` text NOT NULL,
	`label` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS `idx_sim_origins_org_origin` ON `sim_origins` (`organisation_id`,`origin`);

-- 3) Per-learner progress per course (survives reload).
CREATE TABLE IF NOT EXISTS `learner_progress` (
	`id` text PRIMARY KEY NOT NULL,
	`organisation_id` text NOT NULL,
	`user_id` text NOT NULL,
	`course_id` text NOT NULL,
	`learning_score` integer DEFAULT 0 NOT NULL,
	`simulation_score` integer DEFAULT 0 NOT NULL,
	`assessment_score` integer DEFAULT 0 NOT NULL,
	`readiness` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'in-progress' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS `idx_learner_progress_key` ON `learner_progress` (`organisation_id`,`user_id`,`course_id`);

-- 4) Append-only individual simulation / assessment attempts.
CREATE TABLE IF NOT EXISTS `learner_attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`organisation_id` text NOT NULL,
	`user_id` text NOT NULL,
	`course_id` text NOT NULL,
	`kind` text NOT NULL,
	`ref_id` text DEFAULT '' NOT NULL,
	`score` integer DEFAULT 0 NOT NULL,
	`detail_json` text DEFAULT '{}' NOT NULL,
	`created_at` text NOT NULL
);
CREATE INDEX IF NOT EXISTS `idx_learner_attempts_key` ON `learner_attempts` (`organisation_id`,`user_id`,`course_id`);

-- 5) Issued readiness credentials (one per organisation/user/course).
CREATE TABLE IF NOT EXISTS `credentials` (
	`id` text PRIMARY KEY NOT NULL,
	`organisation_id` text NOT NULL,
	`user_id` text NOT NULL,
	`course_id` text NOT NULL,
	`learner` text DEFAULT '' NOT NULL,
	`programme` text DEFAULT '' NOT NULL,
	`readiness` integer DEFAULT 0 NOT NULL,
	`breakdown_json` text DEFAULT '{}' NOT NULL,
	`issued_at` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS `idx_credentials_key` ON `credentials` (`organisation_id`,`user_id`,`course_id`);
