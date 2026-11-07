BEGIN;
-- Material identity is deduplicated while independent paths remain explicit.
CREATE OR REPLACE FUNCTION private.shared_collection_ids_v1(p_user_id uuid)
RETURNS TABLE(collection_id uuid,owner_user_id uuid,root_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,private,pg_temp AS $$
 SELECT DISTINCT path.collection_id,path.owner_user_id,path.root_id
 FROM private.live_collection_access_paths_v1 path WHERE path.user_id=p_user_id;
$$;
CREATE OR REPLACE VIEW private.shared_author_entry_memberships_v1 AS
 SELECT DISTINCT scope.user_id,entry.id AS entry_id,scope.collection_id,scope.root_id
 FROM private.live_collection_access_paths_v1 scope
 JOIN public.user_word_list_items item ON item.list_id=scope.collection_id
 JOIN private.active_word_entries entry ON entry.id=item.word_id
 JOIN public.dictionaries dictionary ON dictionary.id=entry.dictionary_id
 WHERE dictionary.kind='user' AND dictionary.owner_user_id=scope.owner_user_id AND entry.management_kind='user';
REVOKE ALL ON FUNCTION private.shared_collection_ids_v1(uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON private.shared_author_entry_memberships_v1 FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
