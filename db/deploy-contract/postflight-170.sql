\i db/deploy-contract/postflight-169.sql
BEGIN;
DO $sentence_translation_contract$
DECLARE
  definition text;
  config text[];
BEGIN
  SELECT pg_get_functiondef(
    'private.training_translation_source_nodes_v1(uuid,uuid,text,jsonb)'::regprocedure
  ) INTO definition;
  IF (strpos(definition, 'platform_v2_training_ordinary_meaning_eligible_v1') = 0
      AND strpos(definition, 'eligible_entries AS MATERIALIZED') = 0)
     OR strpos(definition, 'training_extra_source_entries_v1') = 0
     OR strpos(definition, 'raw\.meanings') = 0 THEN
    RAISE EXCEPTION 'db-contract-gate: postflight-failed sentence source scope';
  END IF;
  IF has_function_privilege('authenticated', 'private.training_translation_source_nodes_v1(uuid,uuid,text,jsonb)', 'EXECUTE')
     OR has_function_privilege('anon', 'private.training_translation_source_nodes_v1(uuid,uuid,text,jsonb)', 'EXECUTE')
     OR has_function_privilege('service_role', 'private.training_translation_source_nodes_v1(uuid,uuid,text,jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'db-contract-gate: sentence source helper privilege boundary changed';
  END IF;

  SELECT pg_get_functiondef(
    'private.platform_v2_translation_exercise_candidates_v2(uuid,integer,integer,uuid,text,text,jsonb)'::regprocedure
  ) INTO definition;
  IF strpos(definition, 'training_translation_source_nodes_v1') = 0
     OR strpos(definition, 'training_pair_exclusions') = 0
     OR strpos(definition, 'row_number()') = 0 THEN
    RAISE EXCEPTION 'db-contract-gate: postflight-failed filtered sentence candidates';
  END IF;

  IF NOT has_function_privilege('authenticated', 'public.start_platform_v2_translation_training_session_scoped(uuid,text,uuid,uuid,text,text,jsonb,integer)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.start_platform_v2_translation_training_session_scoped(uuid,text,uuid,uuid,text,text,jsonb,integer)', 'EXECUTE')
     OR has_function_privilege('service_role', 'public.start_platform_v2_translation_training_session_scoped(uuid,text,uuid,uuid,text,text,jsonb,integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'db-contract-gate: sentence scoped-start grants changed';
  END IF;
  SELECT proconfig INTO config FROM pg_proc
   WHERE oid = 'public.start_platform_v2_translation_training_session_scoped(uuid,text,uuid,uuid,text,text,jsonb,integer)'::regprocedure;
  IF NOT ('search_path=public, private, extensions, pg_temp' = ANY(config)) THEN
    RAISE EXCEPTION 'db-contract-gate: sentence scoped-start search_path changed';
  END IF;

  IF NOT has_function_privilege('authenticated', 'public.read_training_translation_stats_v1(uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.read_training_translation_stats_v1(uuid)', 'EXECUTE')
     OR has_function_privilege('service_role', 'public.read_training_translation_stats_v1(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'db-contract-gate: sentence stats grants changed';
  END IF;
  SELECT pg_get_functiondef('public.read_training_translation_stats_v1(uuid)'::regprocedure) INTO definition;
  IF strpos(definition, 'training_translation_source_nodes_v1') = 0
     OR strpos(definition, 'training_pair_excluded_v1') = 0
     OR strpos(definition, 'training-translation-stats-v1') = 0 THEN
    RAISE EXCEPTION 'db-contract-gate: postflight-failed sentence scoped stats';
  END IF;
END
$sentence_translation_contract$;
COMMIT;
