-- Verify ordinary Dutch lexical candidate filtering after migration 157.
\i db/deploy-contract/postflight-156.sql

BEGIN;
DO $postflight_lexical_filters$
DECLARE
  v_definition text;
BEGIN
  IF to_regprocedure('private.normalize_training_part_of_speech_v1(text)') IS NULL
     OR to_regprocedure('private.training_lexical_candidate_matches_v1(text,text,jsonb)') IS NULL
     OR to_regprocedure('private.training_scheduler_candidates_v2(uuid,text[],uuid,text,text,text,uuid[],text[],jsonb,boolean,boolean)') IS NULL THEN
    RAISE EXCEPTION 'db-contract-gate: postflight-failed lexical-filter-signature';
  END IF;

  IF has_function_privilege('anon', 'private.normalize_training_part_of_speech_v1(text)', 'execute')
     OR has_function_privilege('authenticated', 'private.normalize_training_part_of_speech_v1(text)', 'execute')
     OR has_function_privilege('service_role', 'private.normalize_training_part_of_speech_v1(text)', 'execute')
     OR has_function_privilege('anon', 'private.training_lexical_candidate_matches_v1(text,text,jsonb)', 'execute')
     OR has_function_privilege('authenticated', 'private.training_lexical_candidate_matches_v1(text,text,jsonb)', 'execute')
     OR has_function_privilege('service_role', 'private.training_lexical_candidate_matches_v1(text,text,jsonb)', 'execute') THEN
    RAISE EXCEPTION 'db-contract-gate: postflight-failed lexical-filter-private-grants';
  END IF;

  IF NOT has_function_privilege('authenticated',
       'public.get_next_filtered_card(uuid,text[],uuid[],uuid,text,text,text,text[],jsonb,boolean)', 'execute')
     OR has_function_privilege('anon',
       'public.get_next_filtered_card(uuid,text[],uuid[],uuid,text,text,text,text[],jsonb,boolean)', 'execute') THEN
    RAISE EXCEPTION 'db-contract-gate: postflight-failed lexical-filter-selector-grants';
  END IF;

  SELECT pg_get_functiondef(
    'private.training_scheduler_candidates_v2(uuid,text[],uuid,text,text,text,uuid[],text[],jsonb,boolean,boolean)'::regprocedure
  ) INTO v_definition;
  IF v_definition !~ 'training_lexical_candidate_matches_v1'
     OR v_definition !~ 'scope' THEN
    RAISE EXCEPTION 'db-contract-gate: postflight-failed lexical-filter-scope-routing';
  END IF;

  SELECT pg_get_functiondef(
    'public.get_next_filtered_card(uuid,text[],uuid[],uuid,text,text,text,text[],jsonb,boolean)'::regprocedure
  ) INTO v_definition;
  IF v_definition !~ 'activity_filtered'
     OR v_definition !~ 'training_scheduler_candidates_v2' THEN
    RAISE EXCEPTION 'db-contract-gate: postflight-failed lexical-filter-activity-routing';
  END IF;
END
$postflight_lexical_filters$;
COMMIT;
