\i db/deploy-contract/postflight-170.sql
BEGIN;
DO $sentence_source_eligibility_contract$
DECLARE
  definition text;
  config text[];
BEGIN
  SELECT pg_get_functiondef(
    'private.training_translation_source_nodes_v1(uuid,uuid,text,jsonb)'::regprocedure
  ) INTO definition;
  IF strpos(definition, 'eligible_entries AS MATERIALIZED') = 0
     OR strpos(definition, 'grouped_entries AS MATERIALIZED') = 0
     OR strpos(definition, 'training_extra_source_entries_v1') = 0
     OR strpos(definition, 'platform_v2_training_ordinary_meaning_eligible_v1') > 0
     OR strpos(definition, 'user_card_status') = 0
     OR strpos(definition, 'user_card_known_marks') = 0
     OR strpos(definition, 'source_group_key') = 0
     OR strpos(definition, 'binding_state') = 0
     OR strpos(definition, 'raw\.meanings') = 0 THEN
    RAISE EXCEPTION 'db-contract-gate: postflight-failed set-based sentence eligibility';
  END IF;
  SELECT proconfig INTO config
    FROM pg_proc
   WHERE oid = 'private.training_translation_source_nodes_v1(uuid,uuid,text,jsonb)'::regprocedure;
  IF NOT ('search_path=public, private, extensions, pg_temp' = ANY(config)) THEN
    RAISE EXCEPTION 'db-contract-gate: sentence source helper search_path changed';
  END IF;
  IF has_function_privilege('authenticated', 'private.training_translation_source_nodes_v1(uuid,uuid,text,jsonb)', 'EXECUTE')
     OR has_function_privilege('anon', 'private.training_translation_source_nodes_v1(uuid,uuid,text,jsonb)', 'EXECUTE')
     OR has_function_privilege('service_role', 'private.training_translation_source_nodes_v1(uuid,uuid,text,jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'db-contract-gate: sentence source helper privilege boundary changed';
  END IF;
END
$sentence_source_eligibility_contract$;
COMMIT;
