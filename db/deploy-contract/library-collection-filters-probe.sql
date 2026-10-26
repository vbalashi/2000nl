DO $probe$
DECLARE
  signature regprocedure := to_regprocedure('public.fetch_library_collection_entries(uuid,text,jsonb,text,text,integer,integer)');
  definition text;
BEGIN
  IF signature IS NULL THEN RAISE EXCEPTION 'missing library collection filter RPC'; END IF;
  SELECT pg_get_functiondef(signature) INTO definition;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid=signature AND prosecdef AND provolatile='s'
    AND proconfig @> ARRAY['search_path=pg_catalog, public, pg_temp']) THEN
    RAISE EXCEPTION 'unsafe library collection filter boundary'; END IF;
  IF has_function_privilege('anon',signature,'EXECUTE') OR NOT has_function_privilege('authenticated',signature,'EXECUTE') THEN
    RAISE EXCEPTION 'unexpected library collection filter grants'; END IF;
  IF definition NOT LIKE '%principal uuid := (select auth.uid())%' OR definition NOT LIKE '%list.user_id=principal%'
    OR definition NOT LIKE '%can_browse_dictionary(principal,w.dictionary_id)%'
    OR definition NOT LIKE '%private.library_entry_matches_filters_v1%'
    OR definition NOT LIKE '%FROM scoped%' THEN
    RAISE EXCEPTION 'missing collection scope/count/filter boundary'; END IF;
END;
$probe$;
