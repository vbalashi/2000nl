-- Avoid the one-row estimate for the materialized first-meaning relation
-- producing quadratic nested loops on source-bound ordinary Training pools.
-- Keep the planner preference scoped to the scheduler function only.
BEGIN;

ALTER FUNCTION private.training_scheduler_candidates_v2(
  uuid, text[], uuid, text, text, text, uuid[], text[], jsonb, boolean, boolean
) SET enable_nestloop = off;

COMMIT;
