-- Preserve the ordinary Training gate and verify the additive, filtered
-- idiom start remains behind an authenticated public boundary.
\i db/deploy-contract/postflight-160.sql

BEGIN;
DO $postflight_extra_source_scope$
DECLARE
  v_scope text;
  v_candidates text;
  v_start text;
BEGIN
  SELECT pg_get_functiondef(
    'private.training_extra_source_entries_v1(uuid,uuid,text,jsonb)'::regprocedure
  ) INTO v_scope;
  SELECT pg_get_functiondef(
    'private.platform_v2_idiom_exercise_candidates_v2(uuid,text,integer,integer,uuid,text,text,jsonb)'::regprocedure
  ) INTO v_candidates;
  SELECT pg_get_functiondef(
    'private.start_platform_v2_idiom_training_session_v2(uuid,text,text,uuid,uuid,text,text,jsonb,integer)'::regprocedure
  ) INTO v_start;

  IF v_scope IS NULL
     OR v_scope NOT ILIKE '%training_lexical_candidate_matches_v1%'
     OR v_scope NOT ILIKE '%can_access_dictionary%'
     OR v_scope NOT ILIKE '%user_word_lists%'
     OR v_scope NOT ILIKE '%user_card_action_events%'
     OR v_candidates IS NULL
     OR v_candidates NOT ILIKE '%training_extra_source_entries_v1%'
     OR v_candidates NOT ILIKE '%p_card_filter%'
     OR v_start IS NULL
     OR v_start NOT ILIKE '%platform_v2_idiom_exercise_candidates_v2%'
     OR v_start NOT ILIKE '%trainingFilter%'
     OR NOT has_function_privilege(
       'authenticated',
       'public.start_platform_v2_idiom_training_session(uuid,text,text,uuid,uuid,text,text,jsonb,integer)',
       'EXECUTE'
     )
     OR has_function_privilege(
       'anon',
       'public.start_platform_v2_idiom_training_session(uuid,text,text,uuid,uuid,text,text,jsonb,integer)',
       'EXECUTE'
     )
     OR has_function_privilege(
       'authenticated',
       'private.training_extra_source_entries_v1(uuid,uuid,text,jsonb)',
       'EXECUTE'
     ) THEN
    RAISE EXCEPTION 'db-contract-gate: postflight-failed extra-source-scope';
  END IF;
END
$postflight_extra_source_scope$;
COMMIT;
