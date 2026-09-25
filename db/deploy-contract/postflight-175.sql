\i db/deploy-contract/postflight-174.sql
BEGIN;
DO $word_context_member_contract$
DECLARE latch text;
BEGIN
  SELECT pg_get_functiondef('private.start_training_session_latch_v1(uuid,text[],uuid,text,text,jsonb,text,integer)'::regprocedure)
    INTO latch;
  IF strpos(latch, 'context_content_node_id') = 0
     OR strpos(latch, 'word_context_example_unavailable') = 0
     OR NOT EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema='public' AND table_name='training_session_members'
         AND column_name='context_source_text_fingerprint'
     ) THEN
    RAISE EXCEPTION 'db-contract-gate: postflight-failed word-context source latch';
  END IF;
  IF NOT has_function_privilege('authenticated',
      'public.read_training_word_context_member(uuid,uuid,uuid)','EXECUTE')
     OR has_function_privilege('anon',
      'public.read_training_word_context_member(uuid,uuid,uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'db-contract-gate: word-context source read privilege boundary changed';
  END IF;
END
$word_context_member_contract$;
COMMIT;
