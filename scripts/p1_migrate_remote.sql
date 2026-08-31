-- Phase 1 migration (apply once to the remote D1 `amygdala-db`).
-- `npm run deploy` does NOT apply migrations, so run this before deploying the
-- Phase 1 code:
--   CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ACCOUNT_ID=... \
--   npx wrangler d1 execute amygdala-db --remote --file=scripts/p1_migrate_remote.sql
--
-- 1) Whole-document knowledge for large-document handling (documentType,
--    outline, coverage) persisted as a JSON blob on each source.
ALTER TABLE `sources` ADD COLUMN `knowledge_json` text DEFAULT '{}' NOT NULL;

-- 2) Per-workspace brand kit (logo, colours, font) applied via CSS variables.
CREATE TABLE IF NOT EXISTS `brand_kits` (
	`organisation_id` text PRIMARY KEY NOT NULL,
	`workspace_name` text DEFAULT '' NOT NULL,
	`logo_key` text,
	`primary_color` text DEFAULT '' NOT NULL,
	`accent_color` text DEFAULT '' NOT NULL,
	`font_family` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
