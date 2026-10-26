\i db/deploy-contract/postflight-171.sql
BEGIN;
DO $sentence_learned_set_contract$
DECLARE
  definition text;
  config text[];
BEGIN
  SELECT pg_get_functiondef(
    'private.training_translation_source_nodes_v1(uuid,uuid,text,jsonb)'::regprocedure
  ) INTO definition;
  IF strpos(definition, 'learned_entries AS MATERIALIZED') = 0
     OR strpos(definition, 'dictionary_access AS MATERIALIZED') = 0
     OR strpos(definition, 'accessible_learned AS MATERIALIZED') = 0
     OR strpos(definition, 'eligible_groups AS MATERIALIZED') = 0
     OR strpos(definition, 'training_extra_source_entries_v1') = 0
     OR strpos(definition, 'can_access_dictionary') = 0
     OR strpos(definition, 'user_card_status') = 0
     OR strpos(definition, 'user_card_known_marks') = 0
     OR strpos(definition, 'grouped_entries AS MATERIALIZED') > 0
     OR strpos(definition, 'JOIN private.source_entry_bindings AS sibling') > 0
     OR strpos(definition, 'raw\.meanings') = 0 THEN
    RAISE EXCEPTION 'db-contract-gate: postflight-failed learned-set sentence eligibility';
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
$sentence_learned_set_contract$;
COMMIT;
