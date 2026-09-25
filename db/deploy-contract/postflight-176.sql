\i db/deploy-contract/postflight-175.sql
BEGIN;
DO $word_context_evidence_contract$
DECLARE action_function text;
BEGIN
  SELECT pg_get_functiondef('private.perform_platform_v2_card_action_session_latch_v1(uuid,text,uuid,text,text,uuid,text,text,uuid,jsonb,text,text,uuid)'::regprocedure)
    INTO action_function;
  IF strpos(action_function, 'presentation_source_text_fingerprint') = 0
     OR NOT EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema='public' AND table_name='user_card_action_events'
         AND column_name='presentation_hint_opened'
     ) THEN
    RAISE EXCEPTION 'db-contract-gate: postflight-failed word-context action evidence';
  END IF;
  IF NOT has_function_privilege('authenticated',
      'public.mark_training_word_context_hint_opened(uuid,uuid,uuid)','EXECUTE')
     OR has_function_privilege('anon',
      'public.mark_training_word_context_hint_opened(uuid,uuid,uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'db-contract-gate: word-context hint privilege boundary changed';
  END IF;
END
$word_context_evidence_contract$;
COMMIT;
