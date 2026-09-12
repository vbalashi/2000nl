-- Verify the local study-day scheduler alignment after migration 146.
\i db/deploy-contract/postflight-145.sql

DO $postflight_local_study_day_scheduler$
DECLARE
  candidate_fn regprocedure := to_regprocedure(
    'private.training_scheduler_candidates_v2(uuid,text[],uuid,text,text,text,uuid[],text[],jsonb,boolean,boolean)'
  );
  candidate_definition text;
BEGIN
  IF candidate_fn IS NULL THEN
    RAISE EXCEPTION 'db-contract-gate: postflight-failed local-study-day-scheduler-signature';
  END IF;

  candidate_definition := upper(pg_get_functiondef(candidate_fn));
  IF position('TRAINING_STUDY_DAY_BOUNDS_V1' IN candidate_definition) = 0
     OR position('STUDY_DAY_START' IN candidate_definition) = 0
     OR position('STUDY_DAY_END' IN candidate_definition) = 0
     OR position('CURRENT_DATE' IN candidate_definition) > 0 THEN
    RAISE EXCEPTION 'db-contract-gate: postflight-failed local-study-day-scheduler-routing';
  END IF;
END
$postflight_local_study_day_scheduler$;
