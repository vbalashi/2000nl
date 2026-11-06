DO $probe$
DECLARE f regprocedure; definition text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'private.lookup_platform_v2_library_browse_entries_v1(uuid,boolean,text,text,text,integer,integer,jsonb)'::regprocedure,
    'private.lookup_platform_v2_library_filtered_entries_base_v1(uuid,boolean,text,text,text,integer,integer,jsonb)'::regprocedure,
    'private.lookup_platform_v2_library_material_browse_entries_v1(uuid,boolean,text,text,text,integer,integer,jsonb)'::regprocedure,
    'private.lookup_platform_v2_library_material_filtered_entries_base_v1(uuid,boolean,text,text,text,integer,integer,jsonb)'::regprocedure
  ] LOOP
    definition := pg_get_functiondef(f);
    IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid=f AND prosecdef AND provolatile='s')
      OR has_function_privilege('anon',f,'EXECUTE')
      OR has_function_privilege('authenticated',f,'EXECUTE')
      OR has_function_privilege('service_role',f,'EXECUTE')
      OR strpos(definition,'''totalMeanings'', v_total_meanings')=0
      OR strpos(definition,'candidate_counts AS MATERIALIZED')=0
      OR strpos(definition,'count(DISTINCT entry_id) FILTER (WHERE headword_group_id IS NOT NULL)')=0
      OR strpos(definition,'v_missing_identity_count > 0')=0 THEN
      RAISE EXCEPTION 'library_meaning_count_contract';
    END IF;
  END LOOP;
END;
$probe$;
