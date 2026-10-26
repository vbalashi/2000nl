-- Verify the optimized predecessor path without weakening previous contracts.
\i db/deploy-contract/postflight-158.sql

BEGIN;
DO $postflight_scoped_predecessors$
DECLARE
  v_definition text;
BEGIN
  SELECT pg_get_functiondef(
    'private.training_scheduler_candidates_v2(uuid,text[],uuid,text,text,text,uuid[],text[],jsonb,boolean,boolean)'::regprocedure
  ) INTO v_definition;

  IF v_definition IS NULL
     OR v_definition NOT ILIKE '%scoped_source_groups AS NOT MATERIALIZED%'
     OR v_definition NOT ILIKE '%JOIN scoped_source_groups%'
     OR v_definition NOT ILIKE '%active_source_definitions AS MATERIALIZED%'
     OR v_definition NOT ILIKE '%training_reference_now_v1%'
     OR v_definition NOT ILIKE '%training_lexical_candidate_matches_v1%' THEN
    RAISE EXCEPTION 'db-contract-gate: postflight-failed scoped-ordinary-predecessors';
  END IF;
END
$postflight_scoped_predecessors$;
COMMIT;
