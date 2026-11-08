BEGIN;
CREATE OR REPLACE FUNCTION public.confirm_collection_composition_v1(p_plan_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,private,pg_temp AS $$
DECLARE principal uuid:=auth.uid(); plan private.collection_composition_plans%rowtype; entry_ids uuid[];
BEGIN
 IF principal IS NULL THEN RAISE EXCEPTION 'unauthorized' USING ERRCODE='42501'; END IF;
 SELECT * INTO plan FROM private.collection_composition_plans WHERE id=p_plan_id AND user_id=principal FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'collection_plan_unavailable' USING ERRCODE='42501'; END IF;
 IF plan.committed THEN RETURN jsonb_build_object('planId',plan.id,'collectionId',plan.collection_id,'status','committed'); END IF;
 IF plan.expires_at<now() THEN RAISE EXCEPTION 'collection_audience_changed' USING ERRCODE='40001'; END IF;
 -- Acquire author admission before any collection/member tuple. Learning
 -- readers may finish first; nested writes below never wait in reverse order.
 PERFORM pg_advisory_xact_lock(hashtextextended('collection-author-scope:'||principal::text,0));
 PERFORM 1 FROM public.user_word_lists WHERE id=plan.collection_id AND user_id=principal FOR UPDATE NOWAIT;
 IF NOT FOUND THEN RAISE EXCEPTION 'collection_unavailable' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM public.user_word_list_items WHERE list_id=plan.collection_id ORDER BY word_id FOR UPDATE NOWAIT;
 IF private.collection_composition_revision_v1(principal,plan.collection_id)<>plan.revision THEN
  RAISE EXCEPTION 'collection_audience_changed' USING ERRCODE='40001'; END IF;
 CASE plan.operation->>'action'
 WHEN 'add' THEN
  PERFORM 1 FROM public.word_entries WHERE id=(plan.operation->>'entryId')::uuid FOR SHARE NOWAIT;
  PERFORM private.add_entry_to_user_list_core_v1(principal,plan.collection_id,(plan.operation->>'entryId')::uuid);
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
COMMIT;
