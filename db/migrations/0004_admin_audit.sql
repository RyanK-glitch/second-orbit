-- Admin back office: the moderation log becomes a general audit log.
-- target_id becomes text so non-uuid targets (category slugs) can be logged;
-- `details` holds structured before/after values.
--
-- Down (manual; the runner is forward-only):
--   DROP INDEX moderation_actions_created_idx, moderation_actions_target_idx;
--   ALTER TABLE moderation_actions DROP COLUMN details;
--   DELETE FROM moderation_actions WHERE target_type = 'category';
--   ALTER TABLE moderation_actions ALTER COLUMN target_id TYPE uuid USING target_id::uuid;
ALTER TABLE moderation_actions ALTER COLUMN target_id TYPE text USING target_id::text;
ALTER TABLE moderation_actions ADD COLUMN details jsonb NOT NULL DEFAULT '{}'::jsonb;
CREATE INDEX moderation_actions_created_idx ON moderation_actions (created_at DESC);
CREATE INDEX moderation_actions_target_idx ON moderation_actions (target_type, target_id);
