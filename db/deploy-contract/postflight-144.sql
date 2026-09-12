-- Retain the canonical scheduler and sequential-introduction contract, then
-- prohibit the retired count-only helper from returning as a second planner.
\i db/deploy-contract/postflight-143.sql

DO $postflight_retired_count_only_planner$
BEGIN
  IF to_regprocedure(
       'private.default_training_session_plan_counts_v1(uuid,text[],text,text,jsonb)'
     ) IS NOT NULL THEN
    RAISE EXCEPTION 'db-contract-gate: postflight-failed obsolete-count-only-plan-helper';
  END IF;
END
$postflight_retired_count_only_planner$;
