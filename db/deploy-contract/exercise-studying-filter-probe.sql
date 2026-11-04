-- Read-only metadata checks: eligibility remains private and both candidate
-- consumers must honor the same optional filter for counts and session plans.
DO $probe$
DECLARE
  helper regprocedure := to_regprocedure('private.training_word_context_candidate_v2(uuid,uuid,text,jsonb)');
  idioms regprocedure := to_regprocedure('private.training_idiom_source_nodes_v1(uuid,text,uuid,text,jsonb)');
  recipe regprocedure := to_regprocedure('private.training_recipe_eligible_cards_v1(uuid,text[],uuid,text,text,text,uuid[],text[],jsonb,boolean,boolean)');
  scheduler regprocedure := to_regprocedure('private.training_scheduler_candidates_v2(uuid,text[],uuid,text,text,text,uuid[],text[],jsonb,boolean,boolean)');
  role_name text;
BEGIN
  IF helper IS NULL OR idioms IS NULL OR recipe IS NULL OR scheduler IS NULL THEN
    RAISE EXCEPTION 'exercise_studying_filter_missing_function';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid=helper AND prosecdef AND provolatile='s'
    AND proconfig @> ARRAY['search_path=public, private, pg_temp']) THEN
    RAISE EXCEPTION 'exercise_studying_filter_helper_boundary';
  END IF;
  FOREACH role_name IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
    IF has_function_privilege(role_name,helper,'EXECUTE') THEN
      RAISE EXCEPTION 'exercise_studying_filter_helper_exposed: %',role_name;
    END IF;
  END LOOP;
  IF position('studyingOnly' IN pg_get_functiondef(helper))=0
    OR position('training_word_context_candidate_v1' IN pg_get_functiondef(helper))=0
    OR position('studyingOnly' IN pg_get_functiondef(idioms))=0
    OR position('eligible_group.id IS NOT NULL' IN pg_get_functiondef(idioms))=0
    OR position('training_word_context_candidate_v2' IN pg_get_functiondef(recipe))=0
    OR position('training_word_context_candidate_v2' IN pg_get_functiondef(scheduler))=0 THEN
    RAISE EXCEPTION 'exercise_studying_filter_routing';
  END IF;
END;
$probe$;
