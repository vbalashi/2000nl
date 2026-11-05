DO $probe$
DECLARE f regprocedure := 'public.search_library_category_v1(uuid,text,text,uuid[],jsonb,jsonb,text,integer,text)'::regprocedure;
BEGIN
  IF NOT has_function_privilege('service_role',f,'EXECUTE') OR has_function_privilege('authenticated',f,'EXECUTE') OR has_function_privilege('anon',f,'EXECUTE')
    OR NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=f AND prosecdef AND provolatile='s')
    OR has_function_privilege('authenticated','private.library_category_entry_ids_v1(uuid,jsonb)','EXECUTE') THEN
    RAISE EXCEPTION 'library_category_search_scope_contract';
  END IF;
END;
$probe$;
