BEGIN;
ALTER FUNCTION public.add_entry_to_user_list(uuid,uuid,uuid) SET SCHEMA private;
ALTER FUNCTION private.add_entry_to_user_list(uuid,uuid,uuid) RENAME TO add_entry_to_user_list_core_v1;
ALTER FUNCTION public.remove_entries_from_user_list(uuid,uuid,uuid[]) SET SCHEMA private;
ALTER FUNCTION private.remove_entries_from_user_list(uuid,uuid,uuid[]) RENAME TO remove_entries_from_user_list_core_v1;
ALTER FUNCTION public.delete_user_word_list(uuid,uuid) SET SCHEMA private;
ALTER FUNCTION private.delete_user_word_list(uuid,uuid) RENAME TO delete_user_word_list_core_v1;
REVOKE ALL ON FUNCTION private.add_entry_to_user_list_core_v1(uuid,uuid,uuid),private.remove_entries_from_user_list_core_v1(uuid,uuid,uuid[]),private.delete_user_word_list_core_v1(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.confirm_collection_composition_v1(p_plan_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,private,pg_temp AS $$
DECLARE principal uuid:=auth.uid(); plan private.collection_composition_plans%rowtype; entry_ids uuid[];
BEGIN
 IF principal IS NULL THEN RAISE EXCEPTION 'unauthorized' USING ERRCODE='42501'; END IF;
 SELECT * INTO plan FROM private.collection_composition_plans WHERE id=p_plan_id AND user_id=principal FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'collection_plan_unavailable' USING ERRCODE='42501'; END IF;
 IF plan.committed THEN RETURN jsonb_build_object('planId',plan.id,'collectionId',plan.collection_id,'status','committed'); END IF;
 IF plan.expires_at<now() THEN RAISE EXCEPTION 'collection_audience_changed' USING ERRCODE='40001'; END IF;
 PERFORM 1 FROM public.user_word_lists WHERE id=plan.collection_id AND user_id=principal FOR UPDATE NOWAIT;
 IF NOT FOUND THEN RAISE EXCEPTION 'collection_unavailable' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM public.user_word_list_items WHERE list_id=plan.collection_id ORDER BY word_id FOR UPDATE NOWAIT;
 IF NOT pg_try_advisory_xact_lock(hashtextextended('collection-author-scope:'||principal::text,0)) THEN
  RAISE EXCEPTION 'collection_audience_changed' USING ERRCODE='40001'; END IF;
 IF private.collection_composition_revision_v1(principal,plan.collection_id)<>plan.revision THEN
  RAISE EXCEPTION 'collection_audience_changed' USING ERRCODE='40001'; END IF;
 CASE plan.operation->>'action'
 WHEN 'add' THEN PERFORM private.add_entry_to_user_list_core_v1(principal,plan.collection_id,(plan.operation->>'entryId')::uuid);
 WHEN 'remove' THEN
  SELECT array_agg(value::uuid) INTO entry_ids FROM jsonb_array_elements_text(plan.operation->'entryIds');
  PERFORM private.remove_entries_from_user_list_core_v1(principal,plan.collection_id,entry_ids);
 WHEN 'delete' THEN PERFORM private.delete_user_word_list_core_v1(principal,plan.collection_id);
 ELSE RAISE EXCEPTION 'invalid_collection_operation' USING ERRCODE='22023';
 END CASE;
 UPDATE private.collection_composition_plans SET committed=true WHERE id=plan.id;
 RETURN jsonb_build_object('planId',plan.id,'collectionId',plan.collection_id,'status','committed');
EXCEPTION WHEN lock_not_available THEN RAISE EXCEPTION 'collection_audience_changed' USING ERRCODE='40001';
END;
$$;
REVOKE ALL ON FUNCTION public.confirm_collection_composition_v1(uuid) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.add_entry_to_user_list(p_user_id uuid,p_list_id uuid,p_entry_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,private,pg_temp AS $$
BEGIN
 IF auth.uid() IS NULL OR p_user_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'unauthorized' USING ERRCODE='42501'; END IF;
 IF EXISTS(SELECT 1 FROM private.live_collection_access_paths_v1 WHERE owner_user_id=p_user_id AND collection_id=p_list_id) THEN
  RAISE EXCEPTION 'collection_audience_confirmation_required' USING ERRCODE='40001'; END IF;
 PERFORM private.add_entry_to_user_list_core_v1(p_user_id,p_list_id,p_entry_id);
END;
$$;
REVOKE ALL ON FUNCTION public.add_entry_to_user_list(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.add_entry_to_user_list(uuid,uuid,uuid) TO authenticated;
CREATE FUNCTION public.remove_entries_from_user_list(p_user_id uuid,p_list_id uuid,p_entry_ids uuid[]) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,private,pg_temp AS $$
BEGIN
 IF auth.uid() IS NULL OR p_user_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'unauthorized' USING ERRCODE='42501'; END IF;
 IF EXISTS(SELECT 1 FROM private.live_collection_access_paths_v1 WHERE owner_user_id=p_user_id AND collection_id=p_list_id) THEN
  RAISE EXCEPTION 'collection_audience_confirmation_required' USING ERRCODE='40001'; END IF;
 PERFORM private.remove_entries_from_user_list_core_v1(p_user_id,p_list_id,p_entry_ids);
END;
$$;
REVOKE ALL ON FUNCTION public.remove_entries_from_user_list(uuid,uuid,uuid[]) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.remove_entries_from_user_list(uuid,uuid,uuid[]) TO authenticated;
CREATE FUNCTION public.delete_user_word_list(p_user_id uuid,p_list_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,private,pg_temp AS $$
BEGIN
 IF auth.uid() IS NULL OR p_user_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'unauthorized' USING ERRCODE='42501'; END IF;
 IF EXISTS(SELECT 1 FROM private.live_collection_access_paths_v1 WHERE owner_user_id=p_user_id AND collection_id=p_list_id) THEN
  RAISE EXCEPTION 'collection_audience_confirmation_required' USING ERRCODE='40001'; END IF;
 PERFORM private.delete_user_word_list_core_v1(p_user_id,p_list_id);
END;
$$;
REVOKE ALL ON FUNCTION public.delete_user_word_list(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.delete_user_word_list(uuid,uuid) TO authenticated;
COMMIT;
