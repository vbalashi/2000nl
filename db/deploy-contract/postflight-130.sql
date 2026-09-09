-- Keep the established scheduler/read-only postflight and add the #278
-- observable-learning contract checks.
\i db/deploy-contract/postflight-129.sql

BEGIN;

DO $postflight_learning_observability$
DECLARE
  stats_oid regprocedure := to_regprocedure(
    'public.get_detailed_training_stats(uuid,text[],uuid,text)'
  );
  history_oid regprocedure := to_regprocedure(
    'public.get_recent_training_review_history(integer)'
  );
  stats_definition text;
  history_definition text;
BEGIN
  IF stats_oid IS NULL OR history_oid IS NULL THEN
    RAISE EXCEPTION 'db-contract-gate: postflight-failed learning-observability-signatures';
  END IF;

  IF NOT has_function_privilege('authenticated', stats_oid, 'EXECUTE')
     OR has_function_privilege('anon', stats_oid, 'EXECUTE')
     OR NOT has_function_privilege('authenticated', history_oid, 'EXECUTE')
     OR has_function_privilege('anon', history_oid, 'EXECUTE') THEN
    RAISE EXCEPTION 'db-contract-gate: postflight-failed learning-observability-grants';
  END IF;

  stats_definition := upper(pg_get_functiondef(stats_oid));
  history_definition := upper(pg_get_functiondef(history_oid));
  IF position('LEARNINGSTARTEDTODAY' IN stats_definition) = 0
     OR position('GRADUATEDNEWWORDSTODAY' IN stats_definition) = 0
     OR position('START-LEARNING' IN stats_definition) = 0
     OR position('LEARNING_STARTED' IN history_definition) = 0
     OR position('USER_CARD_ACTION_EVENTS' IN history_definition) = 0 THEN
    RAISE EXCEPTION 'db-contract-gate: postflight-failed learning-observability-definition';
  END IF;
END;
$postflight_learning_observability$;

COMMIT;
