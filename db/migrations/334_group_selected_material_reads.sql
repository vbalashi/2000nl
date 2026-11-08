BEGIN;

CREATE OR REPLACE FUNCTION public.get_word_list_summary(p_user_id uuid, p_list_id uuid, p_list_type text) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'private', 'pg_temp'
    AS $$
DECLARE original jsonb;
BEGIN
 IF (select auth.uid()) IS NULL OR p_user_id IS DISTINCT FROM (select auth.uid()) THEN
  RAISE EXCEPTION 'unauthorized: user_id does not match authenticated user'; END IF;
 original:=private.get_word_list_summary_owner_base_v1(p_user_id,p_list_id,p_list_type);
 IF original IS NOT NULL OR p_list_type IS DISTINCT FROM 'user' THEN RETURN original; END IF;
 RETURN (
  SELECT jsonb_build_object('id',list.id,'name',list.name,'language_code',list.language_code,
   'primary_language_code',list.primary_language_code,'created_at',list.created_at,
   'ownership','received','editable',false,'is_mixed_language',counts.language_count>1,
   'user_word_list_items',jsonb_build_array(jsonb_build_object('count',counts.item_count,
    'available_count',counts.item_count,'unavailable_source_count',0)))
  FROM public.user_word_lists list
  CROSS JOIN LATERAL (
   SELECT count(*)::integer AS item_count,count(DISTINCT entry.language_code)::integer AS language_count
   FROM public.user_word_list_items item JOIN private.active_word_entries entry ON entry.id=item.word_id
   WHERE item.list_id=list.id AND private.entry_access_v1(p_user_id,entry.id,'train')
  ) counts
  WHERE list.id=p_list_id AND list.user_id<>p_user_id AND EXISTS(
   SELECT 1 FROM private.live_collection_access_paths_v1 scope
   WHERE scope.user_id=p_user_id AND scope.collection_id=list.id)
 );
END;
$$;

CREATE OR REPLACE FUNCTION public.read_received_collection_label_state_v1(p_collection_id uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'private', 'pg_temp'
    AS $$
DECLARE principal uuid:=(select auth.uid());
BEGIN
 IF principal IS NULL THEN RAISE EXCEPTION 'unauthorized' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM private.live_collection_access_paths_v1 scope
  WHERE scope.user_id=principal AND scope.collection_id=p_collection_id AND scope.owner_user_id<>principal) THEN
  RAISE EXCEPTION 'collection_not_found' USING ERRCODE='42501';
 END IF;
 RETURN jsonb_build_object('collectionId',p_collection_id,'catalog',public.read_collection_labels_v1(principal),
  'labelIds',COALESCE((SELECT jsonb_agg(label_id ORDER BY label_id) FROM private.received_collection_label_placements
   WHERE user_id=principal AND collection_id=p_collection_id),'[]'::jsonb));
END;
$$;

CREATE OR REPLACE FUNCTION public.read_received_collection_source_v1(p_collection_id uuid) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'private', 'pg_temp'
    AS $$
 SELECT (SELECT jsonb_build_object('id',list.id,'name',list.name,'createdAt',list.created_at)
 FROM private.live_collection_access_paths_v1 scope
 JOIN public.user_word_lists list ON list.id=scope.collection_id
 WHERE scope.user_id=(select auth.uid()) AND scope.owner_user_id<>(select auth.uid())
  AND scope.collection_id=p_collection_id LIMIT 1)
$$;

CREATE OR REPLACE FUNCTION public.read_selected_collection_membership_v1(p_collection_id uuid, p_entry_ids uuid[]) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'private', 'pg_temp'
    AS $$
DECLARE principal uuid:=(select auth.uid());
BEGIN
 IF principal IS NULL THEN RAISE EXCEPTION 'unauthorized' USING ERRCODE='42501'; END IF;
 IF p_collection_id IS NULL OR p_entry_ids IS NULL OR cardinality(p_entry_ids)>500 OR array_position(p_entry_ids,NULL) IS NOT NULL THEN
  RAISE EXCEPTION 'invalid_membership_request' USING ERRCODE='22023'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.user_word_lists list WHERE list.id=p_collection_id AND
  (list.user_id=principal OR EXISTS(SELECT 1 FROM private.live_collection_access_paths_v1 scope
    WHERE scope.user_id=principal AND scope.collection_id=list.id))) THEN RETURN NULL; END IF;
 RETURN jsonb_build_object('collectionId',p_collection_id,'includedEntryIds',COALESCE((
  SELECT jsonb_agg(item.word_id ORDER BY item.word_id) FROM public.user_word_list_items item
  WHERE item.list_id=p_collection_id AND item.word_id=ANY(p_entry_ids)
   AND private.entry_access_v1(principal,item.word_id,'browse')
 ),'[]'::jsonb));
END;
$$;

COMMIT;
