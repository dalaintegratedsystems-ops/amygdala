-- Phase 3 migration (apply once to the remote D1 `amygdala-db`).
-- `npm run deploy` does NOT apply migrations, so run this BEFORE deploying the
-- Phase 3 code:
--   CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ACCOUNT_ID=... \
--   npx wrangler d1 execute amygdala-db --remote --file=scripts/p3_migrate_remote.sql
--
-- Additive + idempotent (CREATE TABLE IF NOT EXISTS). The store tolerates a
-- pre-migration state (reads of this table fall back to on-the-fly chunking +
-- keyword retrieval), so deploying before migrating degrades gracefully.

-- Retrieval-sized knowledge chunks + optional embedding vectors for semantic
-- retrieval (RAG). One row per chunk of a source.
CREATE TABLE IF NOT EXISTS `knowledge_chunks` (
	`id` text PRIMARY KEY NOT NULL,
	`organisation_id` text NOT NULL,
	`source_id` text NOT NULL,
	`chunk_index` integer DEFAULT 0 NOT NULL,
	`section` text DEFAULT '' NOT NULL,
	`content` text DEFAULT '' NOT NULL,
	`token_count` integer DEFAULT 0 NOT NULL,
	`embedding_json` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL
);
CREATE INDEX IF NOT EXISTS `idx_knowledge_chunks_source` ON `knowledge_chunks` (`organisation_id`,`source_id`);
