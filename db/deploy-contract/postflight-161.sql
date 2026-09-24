-- Preserve the ordinary Training gate and verify the additive, filtered
-- idiom start remains behind an authenticated public boundary.
\i db/deploy-contract/postflight-160.sql

BEGIN;
DO $postflight_extra_source_scope$
DECLARE
  v_scope text;
  v_candidates text;
  v_start text;
  v_public_argument_names text[];
  v_public_oid oid := 'public.start_platform_v2_idiom_training_session(uuid,text,text,uuid,uuid,text,text,jsonb,integer)'::regprocedure;
  v_scope_oid oid := 'private.training_extra_source_entries_v1(uuid,uuid,text,jsonb)'::regprocedure;
  v_candidates_oid oid := 'private.platform_v2_idiom_exercise_candidates_v2(uuid,text,integer,integer,uuid,text,text,jsonb)'::regprocedure;
  v_start_oid oid := 'private.start_platform_v2_idiom_training_session_v2(uuid,text,text,uuid,uuid,text,text,jsonb,integer)'::regprocedure;
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
  SELECT proargnames INTO v_public_argument_names
  FROM pg_proc WHERE oid = v_public_oid;

  IF v_scope IS NULL
     OR v_scope NOT ILIKE '%training_lexical_candidate_matches_v1%'
     OR v_scope NOT ILIKE '%can_access_dictionary%'
     OR v_scope NOT ILIKE '%user_word_lists%'
     OR v_scope NOT ILIKE '%user_card_action_events%'
     OR v_candidates IS NULL
     OR v_candidates NOT ILIKE '%training_extra_source_entries_v1%'
     OR v_candidates NOT ILIKE '%eligible_source_groups AS MATERIALIZED%'
     OR v_candidates ILIKE '%platform_v2_training_ordinary_meaning_eligible_v1%'
     OR v_candidates NOT ILIKE '%p_card_filter%'
     OR to_regclass('private.platform_v2_content_nodes_active_idiom_entry_idx') IS NULL
     OR v_start IS NULL
     OR v_start NOT ILIKE '%platform_v2_idiom_exercise_candidates_v2%'
     OR v_start NOT ILIKE '%trainingFilter%'
     OR v_public_argument_names IS DISTINCT FROM ARRAY[
       'p_user_id', 'p_direction', 'p_session_size', 'p_request_id',
       'p_list_id', 'p_list_type', 'p_card_filter',
       'p_training_filter', 'p_new_review_ratio'
     ]::text[]
     OR NOT EXISTS (
       SELECT 1 FROM pg_proc AS fn
       WHERE fn.oid = v_public_oid AND fn.prosecdef
         AND fn.proconfig @> ARRAY['search_path=public, private, extensions, pg_temp']
     )
     OR NOT EXISTS (
       SELECT 1 FROM pg_proc AS fn
       WHERE fn.oid = v_scope_oid AND fn.prosecdef
         AND fn.proconfig @> ARRAY['search_path=public, private, pg_temp']
     )
     OR NOT EXISTS (
       SELECT 1 FROM pg_proc AS fn
       WHERE fn.oid IN (v_candidates_oid, v_start_oid) AND fn.prosecdef
         AND fn.proconfig @> ARRAY['search_path=public, private, extensions, pg_temp']
       GROUP BY fn.prosecdef
       HAVING count(*) = 2
     )
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
     OR has_function_privilege('service_role', v_public_oid, 'EXECUTE')
     OR EXISTS (
       SELECT 1
       FROM unnest(ARRAY[v_scope_oid, v_candidates_oid, v_start_oid]) AS fn(oid)
       WHERE has_function_privilege('anon', fn.oid, 'EXECUTE')
          OR has_function_privilege('authenticated', fn.oid, 'EXECUTE')
          OR has_function_privilege('service_role', fn.oid, 'EXECUTE')
     ) THEN
    RAISE EXCEPTION 'db-contract-gate: postflight-failed extra-source-scope';
  END IF;
END
$postflight_extra_source_scope$;
COMMIT;
