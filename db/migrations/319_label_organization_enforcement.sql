BEGIN;
ALTER FUNCTION public.mutate_collection_labels_v1(uuid,bigint,jsonb) SET SCHEMA private;
ALTER FUNCTION private.mutate_collection_labels_v1(uuid,bigint,jsonb) RENAME TO mutate_collection_labels_core_v1;
REVOKE ALL ON FUNCTION private.mutate_collection_labels_core_v1(uuid,bigint,jsonb) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.mutate_collection_labels_v1(p_user_id uuid,p_expected_revision bigint,p_operation jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,private,pg_temp AS $$
BEGIN
 IF p_user_id IS DISTINCT FROM auth.uid() OR auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthorized' USING ERRCODE='42501'; END IF;
 IF EXISTS(SELECT 1 FROM private.label_sharing_roots WHERE owner_user_id=p_user_id AND is_open) THEN
  RAISE EXCEPTION 'label_audience_confirmation_required' USING ERRCODE='40001'; END IF;
 RETURN private.mutate_collection_labels_core_v1(p_user_id,p_expected_revision,p_operation);
END;
$$;
REVOKE ALL ON FUNCTION public.mutate_collection_labels_v1(uuid,bigint,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.mutate_collection_labels_v1(uuid,bigint,jsonb) TO authenticated;
CREATE OR REPLACE FUNCTION public.commit_label_organization_v1(p_expected_catalog_revision bigint,p_operation jsonb,p_expected_audience_revision text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,private,pg_temp AS $$
DECLARE principal uuid:=auth.uid(); result jsonb;
BEGIN
 IF principal IS NULL THEN RAISE EXCEPTION 'unauthorized' USING ERRCODE='42501'; END IF;
 IF p_expected_audience_revision IS NULL OR p_expected_audience_revision !~ '^[0-9a-f]{64}$' THEN
  RAISE EXCEPTION 'invalid_label_operation' USING ERRCODE='22023'; END IF;
 -- Try admission: existing collection/member writers can hold parent tuples
 -- before author admission, so never wait while acquiring their catalog order.
 IF NOT pg_try_advisory_xact_lock(hashtextextended('collection-author-scope:'||principal::text,0)) THEN
  RAISE EXCEPTION 'label_audience_changed' USING ERRCODE='40001'; END IF;
 INSERT INTO private.collection_label_catalogs(user_id) VALUES(principal) ON CONFLICT DO NOTHING;
 PERFORM 1 FROM private.collection_label_catalogs WHERE user_id=principal FOR UPDATE NOWAIT;
 IF private.label_audience_revision_v1(principal) IS DISTINCT FROM p_expected_audience_revision THEN
  RAISE EXCEPTION 'label_audience_changed' USING ERRCODE='40001'; END IF;
 result:=private.mutate_collection_labels_core_v1(principal,p_expected_catalog_revision,p_operation);
 IF EXISTS(SELECT 1 FROM private.label_sharing_roots root
  CROSS JOIN LATERAL private.label_subtree_borrowed_entries_v1(principal,root.label_id) borrowed
  WHERE root.owner_user_id=principal AND root.is_open) THEN
  RAISE EXCEPTION 'share_copy_required' USING ERRCODE='22023'; END IF;
 RETURN result;
EXCEPTION WHEN lock_not_available THEN RAISE EXCEPTION 'label_audience_changed' USING ERRCODE='40001';
END;
$$;
CREATE OR REPLACE FUNCTION public.preview_label_organization_v1(p_expected_catalog_revision bigint,p_operation jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,private,pg_temp AS $$
DECLARE principal uuid:=auth.uid(); before_snapshot jsonb; after_snapshot jsonb; response jsonb;
BEGIN
 IF principal IS NULL THEN RAISE EXCEPTION 'unauthorized' USING ERRCODE='42501'; END IF;
 IF NOT pg_try_advisory_xact_lock(hashtextextended('collection-author-scope:'||principal::text,0)) THEN
  RAISE EXCEPTION 'label_audience_changed' USING ERRCODE='40001'; END IF;
 PERFORM 1 FROM private.collection_label_catalogs WHERE user_id=principal FOR UPDATE NOWAIT;
 before_snapshot:=private.label_audience_snapshot_v1(principal);
 -- A private exception rolls back all prospective writes and their transactional
 -- realtime hints. The response variable survives the subtransaction rollback.
 BEGIN
  PERFORM private.mutate_collection_labels_core_v1(principal,p_expected_catalog_revision,p_operation);
  after_snapshot:=private.label_audience_snapshot_v1(principal);
  response:=jsonb_build_object('audienceRevision',encode(sha256(convert_to(before_snapshot::text,'UTF8')),'hex'),
   'delta',private.label_audience_delta_v1(before_snapshot,after_snapshot),
   'copyRequired',EXISTS(SELECT 1 FROM private.label_sharing_roots root
    CROSS JOIN LATERAL private.label_subtree_borrowed_entries_v1(principal,root.label_id) borrowed
    WHERE root.owner_user_id=principal AND root.is_open));
  RAISE EXCEPTION 'preview_rollback' USING ERRCODE='Z1080';
 EXCEPTION WHEN SQLSTATE 'Z1080' THEN NULL;
 END;
 RETURN response;
EXCEPTION WHEN lock_not_available THEN RAISE EXCEPTION 'label_audience_changed' USING ERRCODE='40001';
END;
$$;
GRANT EXECUTE ON FUNCTION public.prepare_label_organization_v1(bigint,jsonb),public.confirm_label_organization_v1(uuid) TO authenticated;
COMMIT;
