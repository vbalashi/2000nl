BEGIN READ ONLY;
DO $probe$
DECLARE
 fn regprocedure := 'private.lookup_platform_v2_library_browse_entries_v1(uuid,boolean,text,text,text,integer,integer,jsonb)'::regprocedure;
 definition text := pg_get_functiondef(fn);
BEGIN
 IF has_function_privilege('anon',fn,'EXECUTE') OR has_function_privilege('authenticated',fn,'EXECUTE') OR has_function_privilege('service_role',fn,'EXECUTE') THEN
  RAISE EXCEPTION 'Bounded Library helper exposed'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=fn AND prosecdef AND provolatile='s') THEN
  RAISE EXCEPTION 'Bounded Library helper security/read contract'; END IF;
 IF strpos(definition,'source_identities AS MATERIALIZED')=0 OR strpos(definition,'dictionary_entitlements')=0
  OR strpos(definition,'SELECT count(*)::integer FROM candidate_groups')=0 OR strpos(definition,'presentation_identity_incomplete')=0
  OR strpos(definition,'JOIN public.word_entries filter_entry')=0 OR strpos(definition,'browse_query_required')=0 THEN
  RAISE EXCEPTION 'Bounded Library query contract'; END IF;
 IF strpos(pg_get_functiondef('private.lookup_platform_v2_library_filtered_entries_base_v1(uuid,boolean,text,text,text,integer,integer,jsonb)'::regprocedure),
 'RETURN private.lookup_platform_v2_library_browse_entries_v1(')=0 THEN RAISE EXCEPTION 'Library browse dispatch missing'; END IF;
END;
$probe$;
COMMIT;
