BEGIN;
CREATE OR REPLACE FUNCTION private.received_collection_training_available_v1(p_user_id uuid, p_list_id uuid, p_language_code text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'private', 'pg_temp'
    AS $$
 SELECT EXISTS(
  SELECT 1 FROM private.collection_access_paths_for_user_v1(p_user_id) scope
  WHERE scope.user_id=p_user_id AND scope.collection_id=p_list_id AND scope.owner_user_id<>p_user_id
   AND EXISTS(SELECT 1 FROM public.user_word_list_items item
    JOIN private.active_word_entries entry ON entry.id=item.word_id
    WHERE item.list_id=scope.collection_id AND entry.language_code=p_language_code
     AND private.entry_access_v1(p_user_id,entry.id,'train'))
 )
$$;
COMMIT;
