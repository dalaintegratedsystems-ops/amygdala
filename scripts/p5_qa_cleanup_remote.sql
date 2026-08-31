-- One-off cleanup of automated-QA artifacts left on the live workspace.
-- Idempotent. Does not touch the bootstrap admin or non-QA content.
--
--   CLOUDFLARE_API_TOKEN="${CLOUDFLARE_API_TOKEN:-$Cloudflare_API_Token}" \
--   CLOUDFLARE_ACCOUNT_ID="${CLOUDFLARE_ACCOUNT_ID:-$Cloudflare_Account_ID}" \
--   npx wrangler d1 execute amygdala-db --remote --file=scripts/p5_qa_cleanup_remote.sql

-- Restore default (empty) brand kit — no QA Academy name, colour, or logo.
UPDATE brand_kits
SET workspace_name = '',
    logo_key = NULL,
    primary_color = '',
    accent_color = '',
    font_family = '',
    updated_at = datetime('now')
WHERE organisation_id = 'org-primary'
  AND (
    workspace_name LIKE '%QA Academy%'
    OR lower(primary_color) = '#e85d4c'
    OR logo_key IS NOT NULL
  );

-- Orphan assignment whose course no longer exists (raw UUID on learner home).
DELETE FROM assignments
WHERE course_id = 'd6a3047a-e0e4-4e88-834b-127769c9d55e'
   OR course_id NOT IN (SELECT id FROM courses);

-- QA cohort + membership + assignments targeted at it.
DELETE FROM cohort_members
WHERE cohort_id IN (SELECT id FROM cohorts WHERE name LIKE 'QA WF2 Cohort%');
DELETE FROM assignments
WHERE target_type = 'cohort'
  AND target_id IN (SELECT id FROM cohorts WHERE name LIKE 'QA WF2 Cohort%');
DELETE FROM cohorts WHERE name LIKE 'QA WF2 Cohort%';

-- QA-published course, its learner rows, and its source chunks.
DELETE FROM assignments
WHERE course_id IN (SELECT id FROM courses WHERE title LIKE 'Configure a workflow automation%');
DELETE FROM learner_progress
WHERE course_id IN (SELECT id FROM courses WHERE title LIKE 'Configure a workflow automation%');
DELETE FROM learner_attempts
WHERE course_id IN (SELECT id FROM courses WHERE title LIKE 'Configure a workflow automation%');
DELETE FROM credentials
WHERE course_id IN (SELECT id FROM courses WHERE title LIKE 'Configure a workflow automation%');
DELETE FROM knowledge_chunks
WHERE source_id IN (
  SELECT source_id FROM courses WHERE title LIKE 'Configure a workflow automation%'
);
DELETE FROM sources
WHERE id IN (
  SELECT source_id FROM courses WHERE title LIKE 'Configure a workflow automation%'
)
OR title LIKE 'QA Workflow%';
DELETE FROM courses WHERE title LIKE 'Configure a workflow automation%';

-- QA vendor simulation + the example.com origin it may have allow-listed.
DELETE FROM simulations WHERE title LIKE 'QA WF3 example.com%';
DELETE FROM sim_origins WHERE origin = 'https://example.com';

-- QA users (WF2 learner + WF3 CSV) and their dependent rows.
DELETE FROM notifications
WHERE user_id IN (SELECT id FROM users WHERE email IN (
  'qa.wf2.1788206180631@example.com',
  'qa.wf3csv.1788206475835@example.com'
));
DELETE FROM cohort_members
WHERE user_id IN (SELECT id FROM users WHERE email IN (
  'qa.wf2.1788206180631@example.com',
  'qa.wf3csv.1788206475835@example.com'
));
DELETE FROM learner_progress
WHERE user_id IN (SELECT id FROM users WHERE email IN (
  'qa.wf2.1788206180631@example.com',
  'qa.wf3csv.1788206475835@example.com'
));
DELETE FROM learner_attempts
WHERE user_id IN (SELECT id FROM users WHERE email IN (
  'qa.wf2.1788206180631@example.com',
  'qa.wf3csv.1788206475835@example.com'
));
DELETE FROM credentials
WHERE user_id IN (SELECT id FROM users WHERE email IN (
  'qa.wf2.1788206180631@example.com',
  'qa.wf3csv.1788206475835@example.com'
));
DELETE FROM user_profiles
WHERE user_id IN (SELECT id FROM users WHERE email IN (
  'qa.wf2.1788206180631@example.com',
  'qa.wf3csv.1788206475835@example.com'
));
DELETE FROM users
WHERE email IN (
  'qa.wf2.1788206180631@example.com',
  'qa.wf3csv.1788206475835@example.com'
);
