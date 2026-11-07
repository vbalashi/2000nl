BEGIN;

CREATE OR REPLACE FUNCTION private.independent_copy_snapshot_with_notes_v1(p_user_id uuid, p_source_entry_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'private', 'pg_temp'
    AS $$
DECLARE source public.word_entries%rowtype; dictionary public.dictionaries%rowtype; source_dictionary_id uuid;
  roots uuid[]; owners uuid[]; author uuid; source_owner_id uuid; material jsonb; grants jsonb; content jsonb; revision text;
BEGIN
  -- Freeze the candidate parent cohort before any child wait. Never expand it
  -- after waiting: a newly accepted teacher requires a fresh snapshot.
  SELECT dictionary_id INTO source_dictionary_id FROM public.word_entries WHERE id=p_source_entry_id;
  IF NOT FOUND OR source_dictionary_id IS NULL THEN RAISE EXCEPTION 'copy_source_unavailable' USING ERRCODE='42501'; END IF;
  SELECT owner_user_id INTO source_owner_id FROM public.dictionaries WHERE id=source_dictionary_id;
  SELECT COALESCE(array_agg(root_id ORDER BY root_id),'{}'::uuid[]) INTO roots FROM(
    SELECT DISTINCT ON(scope.owner_user_id) scope.root_id
    FROM private.live_collection_access_paths_v1 scope
    JOIN public.user_word_list_items item ON item.list_id=scope.collection_id
    WHERE scope.user_id=p_user_id AND item.word_id=p_source_entry_id AND scope.owner_user_id<>p_user_id
    ORDER BY scope.owner_user_id,scope.root_id LIMIT 1001
  ) covering;
  IF cardinality(roots)>1000 THEN RAISE EXCEPTION 'copy_content_too_large' USING ERRCODE='22023'; END IF;
  SELECT array_agg(id ORDER BY id) INTO owners FROM (
    SELECT p_user_id id UNION SELECT source_owner_id WHERE source_owner_id IS NOT NULL
    UNION SELECT owner_user_id FROM private.live_collection_access_paths_v1 WHERE user_id=p_user_id AND root_id=ANY(roots)
  ) candidates;
  BEGIN
    PERFORM id FROM auth.users WHERE id=ANY(owners) ORDER BY id FOR KEY SHARE NOWAIT;
    IF (SELECT count(*) FROM auth.users WHERE id=ANY(owners))<>cardinality(owners) THEN
      RAISE EXCEPTION 'copy_source_changed' USING ERRCODE='40001';
    END IF;
    SELECT * INTO dictionary FROM public.dictionaries WHERE id=source_dictionary_id FOR KEY SHARE NOWAIT;
    IF NOT FOUND THEN RAISE EXCEPTION 'copy_source_unavailable' USING ERRCODE='42501'; END IF;
    IF dictionary.owner_user_id IS DISTINCT FROM source_owner_id THEN RAISE EXCEPTION 'copy_source_changed' USING ERRCODE='40001'; END IF;
  EXCEPTION WHEN lock_not_available THEN
    RAISE EXCEPTION 'copy_source_changed' USING ERRCODE='40001';
  END;
  SELECT * INTO source FROM private.active_word_entries WHERE id=p_source_entry_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'copy_source_unavailable' USING ERRCODE='42501'; END IF;
  IF source.dictionary_id IS DISTINCT FROM source_dictionary_id THEN RAISE EXCEPTION 'copy_source_changed' USING ERRCODE='40001'; END IF;
  FOREACH author IN ARRAY owners LOOP
    IF NOT pg_try_advisory_xact_lock_shared(hashtextextended('collection-author-scope:'||author::text,0)) THEN
      RAISE EXCEPTION 'copy_source_changed' USING ERRCODE='40001'; END IF;
  END LOOP;
  PERFORM root.id FROM private.collection_sharing_roots root WHERE root.id=ANY(roots) ORDER BY root.id FOR SHARE NOWAIT;
  PERFORM root.id FROM private.label_sharing_roots root WHERE root.id=ANY(roots) ORDER BY root.id FOR SHARE NOWAIT;
  IF EXISTS(SELECT 1 FROM private.live_collection_access_paths_v1
    WHERE user_id=p_user_id AND root_id=ANY(roots) AND NOT(owner_user_id=ANY(owners))) THEN
    RAISE EXCEPTION 'copy_source_changed' USING ERRCODE='40001';
  END IF;
  SELECT * INTO dictionary FROM public.dictionaries WHERE id=source.dictionary_id;
  IF dictionary.owner_user_id IS DISTINCT FROM source_owner_id THEN RAISE EXCEPTION 'copy_source_changed' USING ERRCODE='40001'; END IF;
  IF source.dictionary_id IS NULL OR NOT private.entry_access_v1(p_user_id,source.id,'browse') THEN
    RAISE EXCEPTION 'copy_source_unavailable' USING ERRCODE='42501';
  END IF;
  IF dictionary.kind='user' AND dictionary.owner_user_id IS DISTINCT FROM p_user_id AND NOT EXISTS(
    SELECT 1 FROM private.shared_author_entry_memberships_v1 membership
    WHERE membership.user_id=p_user_id AND membership.entry_id=source.id AND membership.root_id=ANY(roots)) THEN
    RAISE EXCEPTION 'copy_source_changed' USING ERRCODE='40001';
  END IF;
  -- Preserve present-note serialization, including trusted maintenance writes.
  PERFORM note.id FROM public.user_word_notes note WHERE note.word_entry_id=source.id
    AND (note.user_id=p_user_id OR EXISTS(SELECT 1 FROM private.live_collection_access_paths_v1 scope
      JOIN public.user_word_list_items item ON item.list_id=scope.collection_id
      WHERE scope.user_id=p_user_id AND scope.owner_user_id=note.user_id AND item.word_id=source.id AND scope.root_id=ANY(roots)))
    ORDER BY note.user_id FOR SHARE;
  BEGIN
    material:=private.entry_note_scope_material_v1(p_user_id,ARRAY[source.id]);
  EXCEPTION WHEN SQLSTATE '22023' THEN
    IF SQLERRM='note_material_too_large' THEN RAISE EXCEPTION 'copy_content_too_large' USING ERRCODE='22023'; END IF;
    RAISE;
  END;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(material) note WHERE NOT (note->>'isOwn')::boolean AND NOT EXISTS(
    SELECT 1 FROM private.live_collection_access_paths_v1 scope
    JOIN public.user_word_list_items item ON item.list_id=scope.collection_id
    WHERE scope.user_id=p_user_id AND scope.owner_user_id=(note->>'ownerUserId')::uuid
      AND item.word_id=source.id AND scope.root_id=ANY(roots))) THEN
    RAISE EXCEPTION 'copy_source_changed' USING ERRCODE='40001';
  END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('rootId',path.root_id,'kind',path.root_kind,'lifetime',path.access_lifetime)
    ORDER BY path.root_kind,path.root_id),'[]') INTO grants
  FROM (SELECT DISTINCT scope.root_id,scope.root_kind,scope.access_lifetime
    FROM private.live_collection_access_paths_v1 scope JOIN public.user_word_list_items item ON item.list_id=scope.collection_id
    WHERE scope.user_id=p_user_id AND item.word_id=source.id AND scope.root_id=ANY(roots)) path;
  content:=private.copy_source_content_v1(source.raw,private.flatten_copy_note_overlays_v1(source.raw,material),dictionary.kind);
  content:=content||jsonb_strip_nulls(jsonb_build_object('headword',source.headword,'languageCode',source.language_code,
    'partOfSpeech',source.part_of_speech,'gender',source.gender));
  content:=public.validate_user_entry_v1_payload(content,source.language_code);
  revision:=encode(sha256(convert_to(jsonb_build_object('contract','direct-instructional-copy-v1',
    'version',source.content_version,'raw',source.raw,'headword',source.headword,'language',source.language_code,
    'pos',source.part_of_speech,'gender',source.gender,'dictionaryId',dictionary.id,'dictionaryKind',dictionary.kind,
    'dictionaryOwner',dictionary.owner_user_id,'notes',material,'grants',grants)::text,'UTF8')),'hex');
  RETURN jsonb_build_object('content',content,'revision',revision,'sourceDictionaryName',dictionary.name,'sourceDictionaryId',dictionary.id);
END;
$$;

CREATE OR REPLACE FUNCTION private.independent_copy_snapshot_in_cohort_v1(p_user_id uuid, p_source_entry_id uuid, p_cohort jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'private', 'pg_temp'
    AS $$
DECLARE source public.word_entries%rowtype; dictionary public.dictionaries%rowtype; source_dictionary_id uuid;
  roots uuid[]; owners uuid[]; author uuid; source_owner_id uuid; material jsonb; grants jsonb; content jsonb; revision text;
BEGIN
  -- Freeze the candidate parent cohort before any child wait. Never expand it
  -- after waiting: a newly accepted teacher requires a fresh snapshot.
  SELECT dictionary_id INTO source_dictionary_id FROM public.word_entries WHERE id=p_source_entry_id;
  IF NOT FOUND OR source_dictionary_id IS NULL THEN RAISE EXCEPTION 'copy_source_unavailable' USING ERRCODE='42501'; END IF;
  SELECT owner_user_id INTO source_owner_id FROM public.dictionaries WHERE id=source_dictionary_id;
  SELECT COALESCE(array_agg(root_id ORDER BY root_id),'{}'::uuid[]) INTO roots FROM(
    SELECT DISTINCT ON(scope.owner_user_id) scope.root_id
    FROM private.live_collection_access_paths_v1 scope
    JOIN public.user_word_list_items item ON item.list_id=scope.collection_id
    WHERE scope.user_id=p_user_id AND item.word_id=p_source_entry_id AND scope.owner_user_id<>p_user_id
    ORDER BY scope.owner_user_id,scope.root_id LIMIT 1001
  ) covering;
  IF cardinality(roots)>1000 THEN RAISE EXCEPTION 'copy_content_too_large' USING ERRCODE='22023'; END IF;
  SELECT array_agg(id ORDER BY id) INTO owners FROM (
    SELECT p_user_id id UNION SELECT source_owner_id WHERE source_owner_id IS NOT NULL
    UNION SELECT owner_user_id FROM private.live_collection_access_paths_v1 WHERE user_id=p_user_id AND root_id=ANY(roots)
  ) candidates;
  IF p_cohort IS NULL OR NOT(p_cohort->'entries' ? p_source_entry_id::text)
    OR NOT(p_cohort->'dictionaries' ? source_dictionary_id::text)
    OR EXISTS(SELECT 1 FROM unnest(owners) id WHERE NOT(p_cohort->'owners' ? id::text))
    OR EXISTS(SELECT 1 FROM unnest(roots) id WHERE NOT(p_cohort->'roots' ? id::text)) THEN
    RAISE EXCEPTION 'copy_source_changed' USING ERRCODE='40001';
  END IF;
  BEGIN
    PERFORM id FROM auth.users WHERE id=ANY(owners) ORDER BY id FOR KEY SHARE NOWAIT;
    IF (SELECT count(*) FROM auth.users WHERE id=ANY(owners))<>cardinality(owners) THEN
      RAISE EXCEPTION 'copy_source_changed' USING ERRCODE='40001';
    END IF;
    SELECT * INTO dictionary FROM public.dictionaries WHERE id=source_dictionary_id FOR KEY SHARE NOWAIT;
    IF NOT FOUND THEN RAISE EXCEPTION 'copy_source_unavailable' USING ERRCODE='42501'; END IF;
    IF dictionary.owner_user_id IS DISTINCT FROM source_owner_id THEN RAISE EXCEPTION 'copy_source_changed' USING ERRCODE='40001'; END IF;
  EXCEPTION WHEN lock_not_available THEN
    RAISE EXCEPTION 'copy_source_changed' USING ERRCODE='40001';
  END;
  SELECT * INTO source FROM private.active_word_entries WHERE id=p_source_entry_id FOR UPDATE NOWAIT;
  IF NOT FOUND THEN RAISE EXCEPTION 'copy_source_unavailable' USING ERRCODE='42501'; END IF;
  IF source.dictionary_id IS DISTINCT FROM source_dictionary_id THEN RAISE EXCEPTION 'copy_source_changed' USING ERRCODE='40001'; END IF;
  FOREACH author IN ARRAY owners LOOP
    IF NOT pg_try_advisory_xact_lock_shared(hashtextextended('collection-author-scope:'||author::text,0)) THEN
      RAISE EXCEPTION 'copy_source_changed' USING ERRCODE='40001'; END IF;
  END LOOP;
  PERFORM root.id FROM private.collection_sharing_roots root WHERE root.id=ANY(roots) ORDER BY root.id FOR SHARE NOWAIT;
  PERFORM root.id FROM private.label_sharing_roots root WHERE root.id=ANY(roots) ORDER BY root.id FOR SHARE NOWAIT;
  IF EXISTS(SELECT 1 FROM private.live_collection_access_paths_v1
    WHERE user_id=p_user_id AND root_id=ANY(roots) AND NOT(owner_user_id=ANY(owners))) THEN
    RAISE EXCEPTION 'copy_source_changed' USING ERRCODE='40001';
  END IF;
  SELECT * INTO dictionary FROM public.dictionaries WHERE id=source.dictionary_id;
  IF dictionary.owner_user_id IS DISTINCT FROM source_owner_id THEN RAISE EXCEPTION 'copy_source_changed' USING ERRCODE='40001'; END IF;
  IF source.dictionary_id IS NULL OR NOT private.entry_access_v1(p_user_id,source.id,'browse') THEN
    RAISE EXCEPTION 'copy_source_unavailable' USING ERRCODE='42501';
  END IF;
  IF dictionary.kind='user' AND dictionary.owner_user_id IS DISTINCT FROM p_user_id AND NOT EXISTS(
    SELECT 1 FROM private.shared_author_entry_memberships_v1 membership
    WHERE membership.user_id=p_user_id AND membership.entry_id=source.id AND membership.root_id=ANY(roots)) THEN
    RAISE EXCEPTION 'copy_source_changed' USING ERRCODE='40001';
  END IF;
  -- Preserve present-note serialization, including trusted maintenance writes.
  PERFORM note.id FROM public.user_word_notes note WHERE note.word_entry_id=source.id
    AND (note.user_id=p_user_id OR EXISTS(SELECT 1 FROM private.live_collection_access_paths_v1 scope
      JOIN public.user_word_list_items item ON item.list_id=scope.collection_id
      WHERE scope.user_id=p_user_id AND scope.owner_user_id=note.user_id AND item.word_id=source.id AND scope.root_id=ANY(roots)))
    ORDER BY note.user_id FOR SHARE NOWAIT;
  BEGIN
    material:=private.entry_note_scope_material_v1(p_user_id,ARRAY[source.id]);
  EXCEPTION WHEN SQLSTATE '22023' THEN
    IF SQLERRM='note_material_too_large' THEN RAISE EXCEPTION 'copy_content_too_large' USING ERRCODE='22023'; END IF;
    RAISE;
  END;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(material) note WHERE NOT (note->>'isOwn')::boolean AND NOT EXISTS(
    SELECT 1 FROM private.live_collection_access_paths_v1 scope
    JOIN public.user_word_list_items item ON item.list_id=scope.collection_id
    WHERE scope.user_id=p_user_id AND scope.owner_user_id=(note->>'ownerUserId')::uuid
      AND item.word_id=source.id AND scope.root_id=ANY(roots))) THEN
    RAISE EXCEPTION 'copy_source_changed' USING ERRCODE='40001';
  END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('rootId',path.root_id,'kind',path.root_kind,'lifetime',path.access_lifetime)
    ORDER BY path.root_kind,path.root_id),'[]') INTO grants
  FROM (SELECT DISTINCT scope.root_id,scope.root_kind,scope.access_lifetime
    FROM private.live_collection_access_paths_v1 scope JOIN public.user_word_list_items item ON item.list_id=scope.collection_id
    WHERE scope.user_id=p_user_id AND item.word_id=source.id AND scope.root_id=ANY(roots)) path;
  content:=private.copy_source_content_v1(source.raw,private.flatten_copy_note_overlays_v1(source.raw,material),dictionary.kind);
  content:=content||jsonb_strip_nulls(jsonb_build_object('headword',source.headword,'languageCode',source.language_code,
    'partOfSpeech',source.part_of_speech,'gender',source.gender));
  content:=public.validate_user_entry_v1_payload(content,source.language_code);
  revision:=encode(sha256(convert_to(jsonb_build_object('contract','direct-instructional-copy-v1',
    'version',source.content_version,'raw',source.raw,'headword',source.headword,'language',source.language_code,
    'pos',source.part_of_speech,'gender',source.gender,'dictionaryId',dictionary.id,'dictionaryKind',dictionary.kind,
    'dictionaryOwner',dictionary.owner_user_id,'notes',material,'grants',grants)::text,'UTF8')),'hex');
  RETURN jsonb_build_object('content',content,'revision',revision,'sourceDictionaryName',dictionary.name,'sourceDictionaryId',dictionary.id);
END;
$$;

COMMIT;
