DO $probe$
DECLARE f regprocedure;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'private.library_selected_entry_ids_v1(jsonb,uuid[])'::regprocedure,
    'private.library_entry_order_ranks_v1(uuid[],text)'::regprocedure
  ] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid=f AND prosecdef AND provolatile='s'
      AND 'enable_nestloop=on'=ANY(proconfig))
      OR has_function_privilege('anon',f,'EXECUTE')
      OR has_function_privilege('authenticated',f,'EXECUTE')
      OR has_function_privilege('service_role',f,'EXECUTE')
      OR EXISTS (SELECT 1 FROM pg_proc caller WHERE caller.pronamespace='private'::regnamespace
        AND caller.proname IN ('library_category_entry_ids_v1','lookup_platform_v2_library_browse_entries_v1',
          'lookup_platform_v2_library_filtered_entries_base_v1','lookup_platform_v2_library_material_browse_entries_v1',
          'lookup_platform_v2_library_material_filtered_entries_base_v1','search_library_headwords_v1')
        AND NOT has_function_privilege(caller.proowner,f,'EXECUTE')) THEN
      RAISE EXCEPTION 'library_batch_selection_contract';
    END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM pg_proc WHERE oid='private.library_selected_entry_ids_v1(jsonb,uuid[])'::regprocedure
    AND NOT has_function_privilege(proowner,'private.vocabulary_selected_entry_ids_v1(jsonb,uuid[])','EXECUTE')) THEN
    RAISE EXCEPTION 'library_vocabulary_owner_contract';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid='private.search_library_body_v1(uuid,boolean,text,text,uuid[],text,integer,text,jsonb)'::regprocedure
    AND 'plan_cache_mode=force_custom_plan'=ANY(proconfig)) OR position('v_selected_ids' IN pg_get_functiondef(
    'private.search_library_body_v1(uuid,boolean,text,text,uuid[],text,integer,text,jsonb)'::regprocedure))=0 THEN
    RAISE EXCEPTION 'library_body_scope_contract';
  END IF;
END;
$probe$;
