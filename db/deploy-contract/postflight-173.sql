\i db/deploy-contract/postflight-172.sql
BEGIN;
DO $sentence_candidate_batch_contract$
DECLARE
  definition text;
  config text[];
  language_name text;
BEGIN
  SELECT pg_get_functiondef(procedure_state.oid), procedure_state.proconfig,
         language_state.lanname
    INTO definition, config, language_name
    FROM pg_proc AS procedure_state
    JOIN pg_language AS language_state
      ON language_state.oid = procedure_state.prolang
   WHERE procedure_state.oid =
     'private.platform_v2_translation_exercise_candidates_v2(uuid,integer,integer,uuid,text,text,jsonb)'::regprocedure;
  IF language_name <> 'sql'
     OR strpos(definition, 'selected AS MATERIALIZED') = 0
     OR strpos(definition, 'ON CONFLICT (entry_id, content_node_id, family, direction)') = 0
     OR strpos(definition, 'target_rows AS MATERIALIZED') = 0
     OR strpos(definition, 'ensure_platform_v2_training_exercise_target_v1') > 0
     OR strpos(definition, 'platform_v2_training_exercise_state_json_v1') > 0 THEN
    RAISE EXCEPTION 'db-contract-gate: postflight-failed batched sentence targets';
  END IF;
  IF NOT ('search_path=public, private, extensions, pg_temp' = ANY(config)) THEN
    RAISE EXCEPTION 'db-contract-gate: sentence candidates search_path changed';
  END IF;
  IF has_function_privilege('authenticated',
       'private.platform_v2_translation_exercise_candidates_v2(uuid,integer,integer,uuid,text,text,jsonb)', 'EXECUTE')
     OR has_function_privilege('anon',
       'private.platform_v2_translation_exercise_candidates_v2(uuid,integer,integer,uuid,text,text,jsonb)', 'EXECUTE')
     OR has_function_privilege('service_role',
       'private.platform_v2_translation_exercise_candidates_v2(uuid,integer,integer,uuid,text,text,jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'db-contract-gate: sentence candidates privilege boundary changed';
  END IF;
END
$sentence_candidate_batch_contract$;
COMMIT;
