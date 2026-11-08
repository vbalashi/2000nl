BEGIN;
-- Audience is read only after exclusive owner admission, so accept/move cannot
-- turn an unshared legacy write into an unconfirmed shared write while it waits.
CREATE OR REPLACE FUNCTION public.add_entry_to_user_list(p_user_id uuid,p_list_id uuid,p_entry_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,private,pg_temp AS $$
BEGIN
 IF auth.uid() IS NULL OR p_user_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'unauthorized' USING ERRCODE='42501'; END IF;
 PERFORM private.lock_sharing_author_scope_v1(p_user_id,true);
 IF EXISTS(SELECT 1 FROM private.live_collection_access_paths_v1 WHERE owner_user_id=p_user_id AND collection_id=p_list_id) THEN
  RAISE EXCEPTION 'collection_audience_confirmation_required' USING ERRCODE='40001'; END IF;
 PERFORM private.add_entry_to_user_list_core_v1(p_user_id,p_list_id,p_entry_id);
END;
$$;
REVOKE ALL ON FUNCTION public.add_entry_to_user_list(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.add_entry_to_user_list(uuid,uuid,uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.remove_entries_from_user_list(p_user_id uuid,p_list_id uuid,p_entry_ids uuid[]) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,private,pg_temp AS $$
BEGIN
 IF auth.uid() IS NULL OR p_user_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'unauthorized' USING ERRCODE='42501'; END IF;
 PERFORM private.lock_sharing_author_scope_v1(p_user_id,true);
 IF EXISTS(SELECT 1 FROM private.live_collection_access_paths_v1 WHERE owner_user_id=p_user_id AND collection_id=p_list_id) THEN
  RAISE EXCEPTION 'collection_audience_confirmation_required' USING ERRCODE='40001'; END IF;
 PERFORM private.remove_entries_from_user_list_core_v1(p_user_id,p_list_id,p_entry_ids);
END;
$$;
REVOKE ALL ON FUNCTION public.remove_entries_from_user_list(uuid,uuid,uuid[]) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.remove_entries_from_user_list(uuid,uuid,uuid[]) TO authenticated;
CREATE OR REPLACE FUNCTION public.delete_user_word_list(p_user_id uuid,p_list_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,private,pg_temp AS $$
BEGIN
 IF auth.uid() IS NULL OR p_user_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'unauthorized' USING ERRCODE='42501'; END IF;
 PERFORM private.lock_sharing_author_scope_v1(p_user_id,true);
 IF EXISTS(SELECT 1 FROM private.live_collection_access_paths_v1 WHERE owner_user_id=p_user_id AND collection_id=p_list_id) THEN
  RAISE EXCEPTION 'collection_audience_confirmation_required' USING ERRCODE='40001'; END IF;
 PERFORM private.delete_user_word_list_core_v1(p_user_id,p_list_id);
END;
$$;
REVOKE ALL ON FUNCTION public.delete_user_word_list(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.delete_user_word_list(uuid,uuid) TO authenticated;
COMMIT;
