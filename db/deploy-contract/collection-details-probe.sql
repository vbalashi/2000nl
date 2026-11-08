-- Read-only assertions for the details authority and concurrency boundary.
DO $details_contract$
DECLARE routine regprocedure;
BEGIN
 FOREACH routine IN ARRAY ARRAY['public.read_collection_details_v1(uuid)'::regprocedure,
  'public.update_collection_details_v1(uuid,text,jsonb)'::regprocedure] LOOP
  IF NOT (SELECT prosecdef AND proconfig @> ARRAY['search_path=pg_catalog, public, private, pg_temp'] FROM pg_proc WHERE oid=routine)
   OR NOT has_function_privilege('authenticated',routine,'EXECUTE')
   OR has_function_privilege('anon',routine,'EXECUTE') OR has_function_privilege('service_role',routine,'EXECUTE') THEN
   RAISE EXCEPTION 'db-contract-gate: details RPC boundary changed: %',routine;
  END IF;
 END LOOP;
 IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.user_word_lists'::regclass AND tgname='collection_details_revision' AND NOT tgisinternal AND tgenabled='O') THEN
  RAISE EXCEPTION 'db-contract-gate: details revision trigger missing'; END IF;
 IF has_function_privilege('authenticated','private.bump_collection_details_revision_v1()','EXECUTE') OR
    has_function_privilege('anon','private.bump_collection_details_revision_v1()','EXECUTE') OR
    has_function_privilege('service_role','private.bump_collection_details_revision_v1()','EXECUTE') THEN
  RAISE EXCEPTION 'db-contract-gate: details trigger function exposed'; END IF;
 IF strpos(pg_get_functiondef('public.read_collection_details_v1(uuid)'::regprocedure),'private.live_collection_access_paths_v1')=0 OR
    strpos(pg_get_functiondef('public.update_collection_details_v1(uuid,text,jsonb)'::regprocedure),'FOR UPDATE')=0 THEN
  RAISE EXCEPTION 'db-contract-gate: details authority or locking missing'; END IF;
END;
$details_contract$;
