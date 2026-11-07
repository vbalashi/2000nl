BEGIN;
-- Keep recursive group expansion behind a function boundary. Inlining the
-- subtree into every nested entry-access predicate causes planner explosion.
ALTER FUNCTION private.label_subtree_owned_collections_v1(uuid,uuid) SET jit=off;

CREATE FUNCTION private.collection_access_paths_for_user_v1(p_user uuid)
RETURNS TABLE(user_id uuid,collection_id uuid,owner_user_id uuid,root_id uuid,root_kind text,access_lifetime uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,private,pg_temp AS $$
 SELECT path.user_id,path.collection_id,path.owner_user_id,path.root_id,path.root_kind,path.access_lifetime
 FROM private.live_collection_access_paths_v1 path WHERE path.user_id=p_user;
$$;
REVOKE ALL ON FUNCTION private.collection_access_paths_for_user_v1(uuid) FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION private.shared_collection_ids_v1(p_user_id uuid)
RETURNS TABLE(collection_id uuid,owner_user_id uuid,root_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,private,pg_temp AS $$
 SELECT DISTINCT path.collection_id,path.owner_user_id,path.root_id FROM private.collection_access_paths_for_user_v1(p_user_id) path;
$$;
CREATE OR REPLACE FUNCTION private.shared_author_entry_ids_v1(p_user_id uuid,p_entry_ids uuid[] DEFAULT NULL)
RETURNS TABLE(entry_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,private,pg_temp AS $$
 SELECT DISTINCT entry.id FROM private.collection_access_paths_for_user_v1(p_user_id) scope
 JOIN public.user_word_list_items item ON item.list_id=scope.collection_id
 JOIN private.active_word_entries entry ON entry.id=item.word_id
 JOIN public.dictionaries dictionary ON dictionary.id=entry.dictionary_id
 WHERE dictionary.kind='user' AND dictionary.owner_user_id=scope.owner_user_id AND entry.management_kind='user'
 AND (p_entry_ids IS NULL OR entry.id=ANY(p_entry_ids));
$$;
-- Bound JIT compilation to the session planner invocation, not the connection.
ALTER FUNCTION private.start_training_session_latch_v1(uuid,text[],uuid,text,text,jsonb,text) SET jit=off;
ALTER FUNCTION private.start_training_session_latch_v1(uuid,text[],uuid,text,text,jsonb,text,integer) SET jit=off;
COMMIT;
