-- Read-only archive/current-card assertions. No QA users or fixture writes.
DO $author_archive_contract$
DECLARE relation regclass; signature regprocedure; definition text; trigger_name text;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='public.word_entries'::regclass
      AND attname='archived_at' AND atttypid='timestamptz'::regtype AND NOT attisdropped)
    OR NOT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='public.word_entries'::regclass
      AND attname='content_version' AND atttypid='bigint'::regtype AND attnotnull AND NOT attisdropped)
    OR NOT (SELECT relrowsecurity FROM pg_class WHERE oid='public.word_entries'::regclass)
    OR has_table_privilege('anon','public.word_entries','DELETE')
    OR has_table_privilege('authenticated','public.word_entries','DELETE') THEN
    RAISE EXCEPTION 'db-contract-gate: author archive columns/RLS/delete fence missing';
  END IF;
  FOREACH trigger_name IN ARRAY ARRAY['author_entry_content_version','author_entry_archive_guard'] LOOP
    IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.word_entries'::regclass
      AND tgname=trigger_name AND tgenabled='O' AND NOT tgisinternal) THEN
      RAISE EXCEPTION 'db-contract-gate: author archive trigger missing: %',trigger_name;
    END IF;
  END LOOP;
  IF NOT EXISTS(SELECT 1 FROM pg_policy WHERE polrelid='public.word_entries'::regclass
      AND polname='word_entries_archive_read_fence' AND NOT polpermissive AND polcmd='r'
      AND pg_get_expr(polqual,polrelid) LIKE '%archived_at IS NULL%') THEN
    RAISE EXCEPTION 'db-contract-gate: raw archive read fence missing';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_policy WHERE polrelid='public.user_word_notes'::regclass
      AND polname='user_notes_archive_read_fence' AND NOT polpermissive)
    OR NOT EXISTS(SELECT 1 FROM pg_policy WHERE polrelid='public.user_word_notes'::regclass
      AND polname='user_notes_archive_insert_fence' AND NOT polpermissive)
    OR NOT EXISTS(SELECT 1 FROM pg_policy WHERE polrelid='public.user_word_notes'::regclass
      AND polname='user_notes_archive_update_fence' AND NOT polpermissive)
    OR NOT EXISTS(SELECT 1 FROM pg_policy WHERE polrelid='public.word_entry_translations'::regclass
      AND polname='entry_translation_archive_read_fence' AND NOT polpermissive) THEN
    RAISE EXCEPTION 'db-contract-gate: related archived content policies missing';
  END IF;
  FOREACH relation IN ARRAY ARRAY['private.active_word_entries'::regclass,'private.training_current_card_permits'::regclass] LOOP
    IF has_table_privilege('anon',relation,'SELECT,INSERT,UPDATE,DELETE')
      OR has_table_privilege('authenticated',relation,'SELECT,INSERT,UPDATE,DELETE')
      OR has_table_privilege('service_role',relation,'SELECT,INSERT,UPDATE,DELETE') THEN
      RAISE EXCEPTION 'db-contract-gate: archive implementation storage exposed: %',relation;
    END IF;
  END LOOP;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid='private.training_current_card_permits'::regclass)
    OR EXISTS(SELECT 1 FROM pg_policy WHERE polrelid='private.training_current_card_permits'::regclass)
    OR NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='private.training_current_card_permits'::regclass
      AND contype='f' AND confrelid='public.word_entries'::regclass AND confdeltype='c')
    OR NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='private.training_current_card_permits'::regclass
      AND contype='f' AND confrelid='private.platform_v2_training_exercise_targets'::regclass AND confdeltype='c') THEN
    RAISE EXCEPTION 'db-contract-gate: current permit RLS or ephemeral authority lifecycle changed';
  END IF;
  definition:=pg_get_viewdef('private.active_word_entries'::regclass,true);
  IF strpos(definition,'archived_at IS NULL')=0 THEN
    RAISE EXCEPTION 'db-contract-gate: active entry projection lost archive predicate';
  END IF;
  FOREACH signature IN ARRAY ARRAY[
    'public.delete_user_dictionary_entry(uuid,uuid)'::regprocedure,
    'public.read_author_entry_archive_status_v1(uuid,uuid)'::regprocedure,
    'public.acknowledge_current_training_card_v1(uuid,uuid,uuid,text,bigint,text,uuid,text)'::regprocedure,
    'public.read_current_training_entry_v1(uuid,uuid,uuid)'::regprocedure,
    'public.read_training_word_context_member(uuid,uuid,uuid)'::regprocedure,
    'public.mark_training_word_context_hint_opened(uuid,uuid,uuid)'::regprocedure
  ] LOOP
    IF NOT (SELECT prosecdef FROM pg_proc WHERE oid=signature)
      OR NOT EXISTS(SELECT 1 FROM pg_proc,unnest(proconfig) setting
        WHERE oid=signature AND setting LIKE 'search_path=pg_catalog,%pg_temp')
      OR has_function_privilege('anon',signature,'EXECUTE')
      OR has_function_privilege('service_role',signature,'EXECUTE')
      OR NOT has_function_privilege('authenticated',signature,'EXECUTE') THEN
      RAISE EXCEPTION 'db-contract-gate: authenticated archive/current-card RPC boundary changed: %',signature;
    END IF;
  END LOOP;
  FOREACH signature IN ARRAY ARRAY[
    'private.author_entry_active_v1(uuid)'::regprocedure,
    'private.author_entry_content_version_v1()'::regprocedure,
    'private.author_entry_archive_guard_v1()'::regprocedure,
    'private.current_training_permit_binding_valid_v1(private.training_current_card_permits)'::regprocedure,
    'private.current_training_permit_valid_v1(private.training_current_card_permits)'::regprocedure,
    'private.current_training_entry_permitted_v1(uuid,uuid,text)'::regprocedure,
    'private.current_training_target_permitted_v1(uuid,uuid,uuid)'::regprocedure,
    'private.current_training_review_entries_v1(uuid,text)'::regprocedure,
    'private.current_training_review_delegate_entries_v1(uuid,text)'::regprocedure,
    'private.current_training_start_learning_entry_card_v1(uuid,uuid,text)'::regprocedure,
    'private.current_training_handle_card_review_v1(uuid,uuid,text,text,uuid)'::regprocedure,
    'private.training_word_context_entry_available_v1(uuid,uuid,uuid)'::regprocedure
  ] LOOP
    IF has_function_privilege('anon',signature,'EXECUTE')
      OR has_function_privilege('authenticated',signature,'EXECUTE')
      OR has_function_privilege('service_role',signature,'EXECUTE') THEN
      RAISE EXCEPTION 'db-contract-gate: archive/current-card implementation exposed: %',signature;
    END IF;
  END LOOP;
  signature:='private.archive_related_entry_readable_v1(uuid)'::regprocedure;
  IF has_function_privilege('anon',signature,'EXECUTE')
    OR has_function_privilege('service_role',signature,'EXECUTE')
    OR NOT has_function_privilege('authenticated',signature,'EXECUTE') THEN
    RAISE EXCEPTION 'db-contract-gate: related-content policy helper boundary changed';
  END IF;
  FOREACH signature IN ARRAY ARRAY[
    'public.fetch_dictionary_entry_by_id_gated(uuid)'::regprocedure,
    'public.fetch_words_for_list_gated(uuid,text,text,text,boolean,boolean,boolean,integer,integer)'::regprocedure,
    'public.get_available_word_lists(uuid,text,text)'::regprocedure,
    'private.lookup_platform_v2_library_material_browse_entries_v1(uuid,boolean,text,text,text,integer,integer,jsonb)'::regprocedure,
    'private.read_platform_v2_library_group_base_v1(uuid,uuid,integer)'::regprocedure,
    'private.get_next_training_session_card_latch_v1(uuid,uuid,text[])'::regprocedure,
    'private.training_scheduler_candidates_v2(uuid,text[],uuid,text,text,text,uuid[],text[],jsonb,boolean,boolean)'::regprocedure,
    'public.read_platform_v2_idiom_training_session_next(uuid,uuid)'::regprocedure,
    'public.read_platform_v2_translation_training_session_next(uuid,uuid)'::regprocedure
  ] LOOP
    definition:=pg_get_functiondef(signature);
    IF strpos(definition,'private.active_word_entries')=0 THEN
      RAISE EXCEPTION 'db-contract-gate: active read/issuance archive fence missing: %',signature;
    END IF;
  END LOOP;
  definition:=pg_get_functiondef('public.delete_user_dictionary_entry(uuid,uuid)'::regprocedure);
  IF strpos(definition,'archived_at=clock_timestamp()')=0 OR definition ~* 'DELETE\s+FROM\s+(public\.)?word_entries' THEN
    RAISE EXCEPTION 'db-contract-gate: author deletion is not non-destructive archive';
  END IF;
  definition:=pg_get_functiondef('public.refresh_dictionary_search_document(uuid,integer)'::regprocedure);
  IF strpos(definition,'archived_at IS NOT NULL')=0 THEN RAISE EXCEPTION 'db-contract-gate: archived entry can be reindexed'; END IF;
  definition:=pg_get_functiondef('public.read_current_training_entry_v1(uuid,uuid,uuid)'::regprocedure);
  IF strpos(definition,'current_training_permit_valid_v1')=0 OR strpos(definition,'''currentTarget''')=0
    OR strpos(definition,'FOR SHARE')=0 THEN RAISE EXCEPTION 'db-contract-gate: current entry read lost token/version/lock binding'; END IF;
  definition:=pg_get_functiondef('private.training_word_context_entry_available_v1(uuid,uuid,uuid)'::regprocedure);
  IF strpos(definition,'author_entry_active_v1')=0 OR strpos(definition,'current_training_entry_permitted_v1')=0
    OR strpos(definition,'permit.session_id=p_session_id')=0 THEN
    RAISE EXCEPTION 'db-contract-gate: word-context availability lost current-run archive fence';
  END IF;
  definition:=pg_get_functiondef('public.mark_training_word_context_hint_opened(uuid,uuid,uuid)'::regprocedure);
  IF strpos(definition,'require_active_training_session_v1')=0 OR strpos(definition,'FOR SHARE')=0
    OR strpos(definition,'training_word_context_entry_available_v1')=0 THEN
    RAISE EXCEPTION 'db-contract-gate: word-context hint lost run/entry archive ordering';
  END IF;
END;
$author_archive_contract$;
