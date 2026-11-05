DO $probe$
DECLARE f regprocedure := 'private.library_category_entry_ids_v1(uuid,jsonb)'::regprocedure;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid=f AND prosecdef AND provolatile='s')
    OR has_function_privilege('service_role',f,'EXECUTE')
    OR has_function_privilege('authenticated',f,'EXECUTE')
    OR has_function_privilege('anon',f,'EXECUTE') THEN
    RAISE EXCEPTION 'library_search_unfiltered_scope_contract';
  END IF;
END;
$probe$;
