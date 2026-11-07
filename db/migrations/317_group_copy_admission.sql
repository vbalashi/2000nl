BEGIN;
CREATE OR REPLACE FUNCTION private.collection_copy_admission_v1(p_user_id uuid, p_list_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'private', 'pg_temp'
    AS $$
DECLARE entries uuid[]; dictionary_ids uuid[]; owners uuid[]; roots uuid[]; member_count integer; author uuid; root record;
BEGIN
 IF p_user_id IS DISTINCT FROM (select auth.uid()) THEN RAISE EXCEPTION 'unauthorized' USING ERRCODE='42501'; END IF;
 BEGIN
  PERFORM id FROM auth.users WHERE id=p_user_id FOR KEY SHARE NOWAIT;
  IF NOT FOUND THEN RAISE EXCEPTION 'unauthorized' USING ERRCODE='42501'; END IF;
  -- A point copy holds its source before this mutex. Never wait in reverse order.
  IF NOT pg_try_advisory_xact_lock(hashtextextended('independent-copy-recipient:'||p_user_id,0)) THEN
   RAISE EXCEPTION 'copy_source_changed' USING ERRCODE='40001';
  END IF;
  PERFORM id FROM public.user_word_lists WHERE id=p_list_id AND user_id=p_user_id FOR UPDATE NOWAIT;
  IF NOT FOUND THEN RAISE EXCEPTION 'collection_unavailable' USING ERRCODE='42501'; END IF;
  SELECT count(*) INTO member_count FROM (SELECT 1 FROM public.user_word_list_items WHERE list_id=p_list_id LIMIT 5001) bounded;
  IF member_count>5000 THEN RAISE EXCEPTION 'copy_collection_too_large' USING ERRCODE='22023'; END IF;
  PERFORM word_id FROM public.user_word_list_items WHERE list_id=p_list_id ORDER BY word_id FOR UPDATE NOWAIT;
  SELECT COALESCE(array_agg(entry.id ORDER BY entry.id),'{}'::uuid[]) INTO entries
   FROM public.user_word_list_items item JOIN public.word_entries entry ON entry.id=item.word_id
   JOIN public.dictionaries dictionary ON dictionary.id=entry.dictionary_id
   WHERE item.list_id=p_list_id AND dictionary.kind='user' AND dictionary.owner_user_id IS DISTINCT FROM p_user_id;
  IF cardinality(entries)>50 THEN RAISE EXCEPTION 'copy_collection_too_large' USING ERRCODE='22023'; END IF;
  SELECT COALESCE(array_agg(DISTINCT dictionary_id ORDER BY dictionary_id),'{}'::uuid[]) INTO dictionary_ids
   FROM public.word_entries WHERE id=ANY(entries);
  SELECT COALESCE(array_agg(DISTINCT scope.root_id ORDER BY scope.root_id),'{}'::uuid[]) INTO roots
   FROM private.live_collection_access_paths_v1 scope JOIN public.user_word_list_items item ON item.list_id=scope.collection_id
   WHERE scope.user_id=p_user_id AND item.word_id=ANY(entries);
  IF cardinality(roots)>1000 THEN RAISE EXCEPTION 'copy_collection_too_large' USING ERRCODE='22023'; END IF;
  SELECT array_agg(id ORDER BY id) INTO owners FROM(
   SELECT p_user_id id UNION SELECT owner_user_id FROM public.dictionaries WHERE id=ANY(dictionary_ids) AND owner_user_id IS NOT NULL
   UNION SELECT owner_user_id FROM private.live_collection_access_paths_v1 WHERE user_id=p_user_id AND root_id=ANY(roots)
  ) authors;
  PERFORM id FROM auth.users WHERE id=ANY(owners) ORDER BY id FOR KEY SHARE NOWAIT;
  IF (SELECT count(*) FROM auth.users WHERE id=ANY(owners))<>cardinality(owners) THEN RAISE EXCEPTION 'copy_source_changed' USING ERRCODE='40001'; END IF;
  PERFORM id FROM public.dictionaries WHERE id=ANY(dictionary_ids) ORDER BY id FOR KEY SHARE NOWAIT;
  -- Membership writes acquire exclusive author admission. Pre-admit every
  -- participating author without waiting while list/member rows are held.
  FOREACH author IN ARRAY owners LOOP
   IF NOT pg_try_advisory_xact_lock(hashtextextended('collection-author-scope:'||author::text,0)) THEN
    RAISE EXCEPTION 'copy_source_changed' USING ERRCODE='40001';
   END IF;
  END LOOP;
  FOR root IN SELECT r.id,r.owner_user_id FROM private.collection_sharing_roots r
   WHERE r.id=ANY(roots) OR r.collection_id=p_list_id ORDER BY r.id LOOP
   IF root.owner_user_id=p_user_id THEN
    PERFORM id FROM private.collection_sharing_roots WHERE id=root.id FOR UPDATE NOWAIT;
   ELSE
    PERFORM id FROM private.collection_sharing_roots WHERE id=root.id FOR SHARE NOWAIT;
   END IF;
  END LOOP;
  PERFORM id FROM private.label_sharing_roots WHERE id=ANY(roots) ORDER BY id FOR SHARE NOWAIT;
  PERFORM id FROM public.word_entries WHERE id=ANY(entries) ORDER BY id FOR UPDATE NOWAIT;
 EXCEPTION WHEN lock_not_available THEN
  RAISE EXCEPTION 'copy_source_changed' USING ERRCODE='40001';
 END;
 RETURN jsonb_build_object('entries',entries,'dictionaries',dictionary_ids,'owners',owners,'roots',roots);
END;
$$;
COMMIT;
