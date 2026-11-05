DO $probe$
DECLARE f regprocedure := 'private.vocabulary_selected_entry_ids_v1(jsonb,uuid[])'::regprocedure;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid=f AND prosecdef AND provolatile='s')
    OR has_function_privilege('service_role',f,'EXECUTE')
    OR has_function_privilege('authenticated',f,'EXECUTE')
    OR has_function_privilege('anon',f,'EXECUTE')
    OR NOT EXISTS (SELECT 1 FROM pg_index WHERE indexrelid=to_regclass('public.word_entries_active_vocabulary_spelling_v1_idx') AND indisvalid)
    OR NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid='private.vocabulary_entry_selected_v1(uuid,jsonb)'::regprocedure AND 'enable_nestloop=on'=ANY(proconfig))
    OR NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid=f AND 'enable_nestloop=on'=ANY(proconfig))
    OR EXISTS (SELECT 1 FROM pg_proc caller WHERE caller.pronamespace='private'::regnamespace
      AND caller.proname IN ('training_recipe_eligible_cards_v1','training_scheduler_candidates_v2','training_idiom_source_nodes_v1')
      AND NOT has_function_privilege(caller.proowner,f,'EXECUTE'))
    OR position('unit_rows AS MATERIALIZED' in pg_get_functiondef(f))=0 THEN
    RAISE EXCEPTION 'training_frequency_selection_contract';
  END IF;
  f := 'private.training_word_context_entry_ids_v1(uuid,jsonb,uuid[])'::regprocedure;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid=f AND prosecdef AND provolatile='s' AND 'enable_nestloop=on'=ANY(proconfig))
    OR has_function_privilege('service_role',f,'EXECUTE')
    OR has_function_privilege('authenticated',f,'EXECUTE')
    OR has_function_privilege('anon',f,'EXECUTE')
    OR EXISTS (SELECT 1 FROM pg_proc caller WHERE caller.pronamespace='private'::regnamespace
      AND caller.proname IN ('training_recipe_eligible_cards_v1','training_scheduler_candidates_v2')
      AND NOT has_function_privilege(caller.proowner,f,'EXECUTE')) THEN
    RAISE EXCEPTION 'training_context_selection_contract';
  END IF;

END;
$probe$;
