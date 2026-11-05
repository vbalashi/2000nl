DO $probe$
DECLARE f regprocedure;
BEGIN
 IF to_regclass('private.app_release_notes') IS NULL OR to_regclass('private.app_release_note_translations') IS NULL
  OR to_regclass('private.app_release_notes_version_key_idx') IS NULL
  OR EXISTS(SELECT 1 FROM pg_class WHERE oid IN ('private.app_release_notes'::regclass,'private.app_release_note_translations'::regclass) AND NOT relrowsecurity)
  OR has_table_privilege('service_role','private.app_release_notes','SELECT')
  OR has_table_privilege('authenticated','private.app_release_note_translations','UPDATE')
  OR has_table_privilege('anon','private.app_release_notes','SELECT') THEN RAISE EXCEPTION 'release_notes_storage_boundary'; END IF;
 FOREACH f IN ARRAY ARRAY[
  'public.write_app_release_notes_v1(text,text,timestamptz,jsonb,integer,boolean)'::regprocedure,
  'public.read_app_release_notes_v1(text,text,integer,text)'::regprocedure,
  'public.read_app_release_notes_editor_v1(text)'::regprocedure] LOOP
  IF NOT has_function_privilege('service_role',f,'EXECUTE') OR has_function_privilege('anon',f,'EXECUTE')
   OR has_function_privilege('authenticated',f,'EXECUTE')
   OR NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=f AND prosecdef AND proconfig @> ARRAY['search_path=pg_catalog, private, pg_temp']) THEN
   RAISE EXCEPTION 'release_notes_rpc_boundary'; END IF;
 END LOOP;
END;
$probe$;
