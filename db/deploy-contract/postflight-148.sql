-- Verify the deterministic reference clock seam after migration 148.
\i db/deploy-contract/postflight-147.sql

DO $postflight_training_reference_clock$
DECLARE
  reference_now_fn regprocedure := to_regprocedure(
    'private.training_reference_now_v1()'
  );
  fsrs_fn regprocedure := to_regprocedure(
    'fsrs6_compute(numeric,numeric,timestamp with time zone,smallint,numeric,integer,integer,numeric[])'
  );
  candidate_fn regprocedure := to_regprocedure(
    'private.training_scheduler_candidates_v2(uuid,text[],uuid,text,text,text,uuid[],text[],jsonb,boolean,boolean)'
  );
  target_date_fn regprocedure := to_regprocedure(
    'private.training_filter_target_date(jsonb)'
  );
  session_plan_fn regprocedure := to_regprocedure(
    'public.get_training_session_plan(uuid,text[],uuid,text,text,jsonb)'
  );
  reference_now_definition text;
  fsrs_definition text;
  candidate_definition text;
  target_date_definition text;
  session_plan_definition text;
BEGIN
  IF reference_now_fn IS NULL
     OR fsrs_fn IS NULL
     OR candidate_fn IS NULL
     OR target_date_fn IS NULL
     OR session_plan_fn IS NULL THEN
    RAISE EXCEPTION 'db-contract-gate: postflight-failed training-reference-clock-signatures';
  END IF;

  reference_now_definition := upper(pg_get_functiondef(reference_now_fn));
  fsrs_definition := upper(pg_get_functiondef(fsrs_fn));
  candidate_definition := upper(pg_get_functiondef(candidate_fn));
  target_date_definition := upper(pg_get_functiondef(target_date_fn));
  session_plan_definition := upper(pg_get_functiondef(session_plan_fn));

  IF position('CURRENT_SETTING(''TRAINING.TEST_REFERENCE_NOW''' IN reference_now_definition) = 0
     OR position('PRIVATE.TRAINING_REFERENCE_NOW_V1()' IN fsrs_definition) = 0
     OR position('PRIVATE.TRAINING_REFERENCE_NOW_V1()' IN candidate_definition) = 0
     OR position('PRIVATE.TRAINING_REFERENCE_NOW_V1()' IN target_date_definition) = 0
     OR position('PRIVATE.TRAINING_REFERENCE_NOW_V1()' IN session_plan_definition) = 0
     OR position('CLOCK_TIMESTAMP()' IN candidate_definition) > 0
     OR position('NOW()' IN fsrs_definition) > 0 THEN
    RAISE EXCEPTION 'db-contract-gate: postflight-failed training-reference-clock-routing';
  END IF;
END
$postflight_training_reference_clock$;
