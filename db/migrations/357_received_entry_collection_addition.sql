BEGIN;
-- Collection membership may reference an exact received entry without granting
-- the recipient access to the author's entire private dictionary.
CREATE OR REPLACE FUNCTION private.lock_collection_entry_addition_v1(p_owner uuid,p_entry uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,private,pg_temp AS $$
DECLARE source_owner uuid; current_owner uuid; author uuid;
BEGIN
 SELECT dictionary.owner_user_id INTO source_owner FROM public.word_entries entry
 JOIN public.dictionaries dictionary ON dictionary.id=entry.dictionary_id
 WHERE entry.id=p_entry AND dictionary.kind='user' AND dictionary.owner_user_id<>p_owner;
 IF source_owner IS NULL THEN
  PERFORM private.lock_sharing_author_scope_v1(p_owner,true);
 ELSE
  -- The whole cohort is fixed before any tuple wait. Foreign-source admission
  -- uses try locks, so no already-admitted writer can invert another author's
  -- parent/entry lock order. Retry starts with a fresh exact source identity.
  FOR author IN SELECT id FROM unnest(ARRAY[p_owner,source_owner]) id ORDER BY id LOOP
   IF author=p_owner THEN
    IF NOT pg_try_advisory_xact_lock(hashtextextended('collection-author-scope:'||author::text,0)) THEN
     RAISE EXCEPTION 'collection_audience_changed' USING ERRCODE='40001'; END IF;
   ELSE
    IF NOT pg_try_advisory_xact_lock_shared(hashtextextended('collection-author-scope:'||author::text,0)) THEN
     RAISE EXCEPTION 'collection_audience_changed' USING ERRCODE='40001'; END IF;
   END IF;
  END LOOP;
 END IF;
 PERFORM id FROM public.word_entries WHERE id=p_entry FOR SHARE NOWAIT;
 SELECT dictionary.owner_user_id INTO current_owner FROM public.word_entries entry
 JOIN public.dictionaries dictionary ON dictionary.id=entry.dictionary_id
 WHERE entry.id=p_entry AND dictionary.kind='user' AND dictionary.owner_user_id<>p_owner;
 IF current_owner IS DISTINCT FROM source_owner THEN
  RAISE EXCEPTION 'collection_audience_changed' USING ERRCODE='40001'; END IF;
EXCEPTION WHEN lock_not_available THEN
 RAISE EXCEPTION 'collection_audience_changed' USING ERRCODE='40001';
END;
$$;
REVOKE ALL ON FUNCTION private.lock_collection_entry_addition_v1(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION private.add_entry_to_user_list_core_v1(p_user_id uuid, p_list_id uuid, p_entry_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
    v_dictionary_id uuid;
BEGIN
    IF (select auth.uid()) IS NULL OR p_user_id IS DISTINCT FROM (select auth.uid()) THEN
        RAISE EXCEPTION 'unauthorized';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM user_word_lists
        WHERE id = p_list_id
          AND user_id = p_user_id
    ) THEN
        RAISE EXCEPTION 'list_not_found';
    END IF;

    PERFORM private.lock_collection_entry_addition_v1(p_user_id,p_entry_id);

    SELECT dictionary_id INTO v_dictionary_id
    FROM private.active_word_entries
    WHERE id = p_entry_id FOR SHARE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'entry_not_found';
    END IF;

    IF NOT private.entry_access_v1(p_user_id,p_entry_id,'train') THEN
        RAISE EXCEPTION 'entry_not_accessible';
    END IF;

    INSERT INTO user_word_list_items (list_id, word_id)
    VALUES (p_list_id, p_entry_id)
    ON CONFLICT (list_id, word_id) DO NOTHING;
END;
$$;
CREATE OR REPLACE FUNCTION public.add_entry_to_user_list(p_user_id uuid,p_list_id uuid,p_entry_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,private,pg_temp AS $$
BEGIN
 IF auth.uid() IS NULL OR p_user_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'unauthorized' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.user_word_lists WHERE id=p_list_id AND user_id=p_user_id) THEN
  RAISE EXCEPTION 'list_not_found' USING ERRCODE='42501'; END IF;
 PERFORM private.lock_collection_entry_addition_v1(p_user_id,p_entry_id);
 IF EXISTS(SELECT 1 FROM private.live_collection_access_paths_v1 WHERE owner_user_id=p_user_id AND collection_id=p_list_id) THEN
  RAISE EXCEPTION 'collection_audience_confirmation_required' USING ERRCODE='40001'; END IF;
 PERFORM private.add_entry_to_user_list_core_v1(p_user_id,p_list_id,p_entry_id);
END;
$$;
REVOKE ALL ON FUNCTION public.add_entry_to_user_list(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.add_entry_to_user_list(uuid,uuid,uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.confirm_collection_composition_v1(p_plan_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,private,pg_temp AS $$
DECLARE principal uuid:=auth.uid(); plan private.collection_composition_plans%rowtype; entry_ids uuid[];
BEGIN
 IF principal IS NULL THEN RAISE EXCEPTION 'unauthorized' USING ERRCODE='42501'; END IF;
 SELECT * INTO plan FROM private.collection_composition_plans WHERE id=p_plan_id AND user_id=principal;
 IF NOT FOUND THEN RAISE EXCEPTION 'collection_plan_unavailable' USING ERRCODE='42501'; END IF;
 IF NOT plan.committed AND plan.operation->>'action'='add' THEN
  PERFORM private.lock_collection_entry_addition_v1(principal,(plan.operation->>'entryId')::uuid);
 ELSE
  PERFORM private.lock_sharing_author_scope_v1(principal,true);
 END IF;
 SELECT * INTO plan FROM private.collection_composition_plans WHERE id=p_plan_id AND user_id=principal FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'collection_plan_unavailable' USING ERRCODE='42501'; END IF;
 IF plan.committed THEN RETURN jsonb_build_object('planId',plan.id,'collectionId',plan.collection_id,'status','committed'); END IF;
 IF plan.expires_at<now() THEN RAISE EXCEPTION 'collection_audience_changed' USING ERRCODE='40001'; END IF;
 -- Acquire author admission before any collection/member tuple. Learning
 -- readers may finish first; nested writes below never wait in reverse order.
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
