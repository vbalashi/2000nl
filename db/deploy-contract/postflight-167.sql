-- The predecessor gate validates either the original or the delegated source relation.
\i db/deploy-contract/postflight-166.sql
BEGIN;
DO $idiom_stats$
DECLARE
  stats_oid oid := 'public.read_training_idiom_stats_v1(uuid)'::regprocedure;
  stats_body text;
  selector_body text;
BEGIN
  SELECT pg_get_functiondef(stats_oid) INTO stats_body;
  SELECT pg_get_functiondef(
    'private.platform_v2_idiom_exercise_candidates_v2(uuid,text,integer,integer,uuid,text,text,jsonb)'::regprocedure
  ) INTO selector_body;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid = stats_oid AND prosecdef
        AND provolatile = 's'
        AND proconfig @> ARRAY['search_path=public, private, extensions, pg_temp'])
    OR stats_body NOT ILIKE '%auth.uid()%'
    OR stats_body NOT ILIKE '%user_id = v_user_id%'
    OR stats_body NOT ILIKE '%training_idiom_source_nodes_v1%'
    OR stats_body NOT ILIKE '%training_study_day_bounds_v1%'
    OR stats_body ILIKE '%ensure_platform%'
    OR selector_body NOT ILIKE '%training_idiom_source_nodes_v1%'
    OR selector_body NOT ILIKE '%p_card_filter%'
    OR selector_body NOT ILIKE '%training_reference_now_v1%'
    OR NOT has_function_privilege('authenticated',stats_oid,'EXECUTE')
    OR has_function_privilege('anon',stats_oid,'EXECUTE')
    OR has_function_privilege('service_role',stats_oid,'EXECUTE') THEN
    RAISE EXCEPTION 'db-contract-gate: postflight-failed idiom-stats';
  END IF;
END
$idiom_stats$;
COMMIT;
