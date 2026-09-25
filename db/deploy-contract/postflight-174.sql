\i db/deploy-contract/postflight-173.sql
BEGIN;
DO $word_context_eligibility_contract$
DECLARE
  scheduler text;
  latch text;
BEGIN
  SELECT pg_get_functiondef('private.training_scheduler_candidates_v2(uuid,text[],uuid,text,text,text,uuid[],text[],jsonb,boolean,boolean)'::regprocedure)
    INTO scheduler;
  SELECT pg_get_functiondef('private.start_training_session_latch_v1(uuid,text[],uuid,text,text,jsonb,text,integer)'::regprocedure)
    INTO latch;
  IF strpos(scheduler, 'word-in-context') = 0
     OR strpos(scheduler, 'example.entry_id = cards.entry_id') = 0
     OR strpos(scheduler, 'familiar.entry_id = cards.entry_id') = 0
     OR strpos(scheduler, 'training_pair_exclusions') = 0
     OR strpos(latch, 'word_context_requires_reverse_mode') = 0 THEN
    RAISE EXCEPTION 'db-contract-gate: postflight-failed word-context eligibility';
  END IF;
  IF has_function_privilege('authenticated',
       'private.training_scheduler_candidates_v2(uuid,text[],uuid,text,text,text,uuid[],text[],jsonb,boolean,boolean)', 'EXECUTE')
     OR has_function_privilege('anon',
       'private.training_scheduler_candidates_v2(uuid,text[],uuid,text,text,text,uuid[],text[],jsonb,boolean,boolean)', 'EXECUTE') THEN
    RAISE EXCEPTION 'db-contract-gate: word-context scheduler privilege boundary changed';
  END IF;
END
$word_context_eligibility_contract$;
COMMIT;
