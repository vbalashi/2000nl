-- Read-only metadata/privilege contract. No corpus reads, fixtures or gate writes.
DO $probe$
DECLARE metadata jsonb; role_name text; function_row record;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='public.word_entries'::regclass
   AND attname='source_rank' AND atttypid='integer'::regtype AND NOT attisdropped)
 OR NOT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='private.active_word_entries'::regclass
   AND attname='source_rank' AND atttypid='integer'::regtype AND NOT attisdropped) THEN
  RAISE EXCEPTION 'missing_source_rank_storage';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid='private.dictionary_source_settings'::regclass AND relrowsecurity) THEN
  RAISE EXCEPTION 'source_settings_rls_required';
 END IF;
 FOREACH role_name IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
  IF has_table_privilege(role_name,'private.dictionary_source_settings','SELECT,INSERT,UPDATE,DELETE')
    OR has_any_column_privilege(role_name,'private.dictionary_source_settings','SELECT,INSERT,UPDATE') THEN
   RAISE EXCEPTION 'source_settings_table_exposed: %',role_name;
  END IF;
 END LOOP;
 IF has_function_privilege('anon','public.dictionary_source_settings_v1()','EXECUTE')
 OR NOT has_function_privilege('authenticated','public.dictionary_source_settings_v1()','EXECUTE')
 OR NOT has_function_privilege('service_role','public.dictionary_source_settings_v1()','EXECUTE') THEN
  RAISE EXCEPTION 'source_settings_reader_permissions';
 END IF;
 SELECT prosecdef,provolatile,proconfig INTO function_row FROM pg_proc
 WHERE oid='public.dictionary_source_settings_v1()'::regprocedure;
 IF NOT function_row.prosecdef OR function_row.provolatile<>'s'
   OR NOT function_row.proconfig @> ARRAY['search_path=pg_catalog, private, pg_temp'] THEN
  RAISE EXCEPTION 'source_settings_reader_boundary';
 END IF;
 metadata:=public.dictionary_source_settings_v1();
 IF metadata IS NULL OR NOT metadata ?& ARRAY['languageCode','catalogKey','fullListSlug','fullListName','schemaKeyV1','schemaKeyV2','sourceRankKey']
 OR metadata - ARRAY['languageCode','catalogKey','fullListSlug','fullListName','schemaKeyV1','schemaKeyV2','sourceRankKey'] <> '{}'::jsonb THEN
  RAISE EXCEPTION 'source_settings_metadata_shape';
 END IF;
 IF position('private.active_word_entries' IN pg_get_functiondef('public.get_user_list_memberships_for_entries(uuid,uuid[])'::regprocedure))=0
 OR position('private.active_word_entries' IN pg_get_functiondef('private.project_training_scheduler_candidate_v1(uuid,uuid,text,text,jsonb,boolean,bigint,bigint,bigint,bigint,bigint)'::regprocedure))=0 THEN
  RAISE EXCEPTION 'source_profile_archive_fence_missing';
 END IF;
 IF (SELECT prosecdef FROM pg_proc WHERE oid='public.assign_word_entry_default_dictionary()'::regprocedure) THEN
  RAISE EXCEPTION 'source_assignment_must_remain_invoker';
 END IF;
 IF has_table_privilege('anon','public.user_word_notes','SELECT')
 OR has_table_privilege('authenticated','public.user_word_notes','SELECT') THEN
  RAISE EXCEPTION 'raw_note_read_must_use_scoped_rpc';
 END IF;
END;
$probe$;
