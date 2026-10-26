-- Preserve every prior contract and verify dictionary material routing.
\i db/deploy-contract/postflight-159.sql

BEGIN;
DO $postflight_dictionary_material$
DECLARE
  v_definition text;
  v_latch_definition text;
BEGIN
  SELECT pg_get_functiondef(
    'private.training_scheduler_candidates_v2(uuid,text[],uuid,text,text,text,uuid[],text[],jsonb,boolean,boolean)'::regprocedure
  ) INTO v_definition;
  SELECT pg_get_functiondef(
    'private.start_training_session_latch_v1(uuid,text[],uuid,text,text,jsonb,text,integer)'::regprocedure
  ) INTO v_latch_definition;

  IF v_definition IS NULL
     OR v_definition NOT ILIKE '%selected_dictionaries AS MATERIALIZED%'
     OR v_definition NOT ILIKE '%dictionaryScope,mode%'
     OR v_definition NOT ILIKE '%dictionaryScope,languageCode%'
     OR v_definition NOT ILIKE '%readable_dictionary.language_code=filter_values.dictionary_language%'
     OR v_definition NOT ILIKE '%filter_values.dictionary_mode IS NULL%'
     OR v_definition NOT ILIKE '%training_lexical_candidate_matches_v1%'
     OR v_definition NOT ILIKE '%scoped_source_groups AS NOT MATERIALIZED%' THEN
    RAISE EXCEPTION 'db-contract-gate: postflight-failed training-dictionary-material';
  END IF;
  IF v_latch_definition IS NULL
     OR v_latch_definition NOT ILIKE '%training_material_unavailable%'
     OR v_latch_definition NOT ILIKE '%can_access_dictionary%'
     OR v_latch_definition NOT ILIKE '%v_filter ? ''dictionaryScope''%' THEN
    RAISE EXCEPTION 'db-contract-gate: postflight-failed training-material-start-boundary';
  END IF;
END
$postflight_dictionary_material$;
COMMIT;
