BEGIN;
CREATE FUNCTION public.preview_label_organization_v1(p_expected_catalog_revision bigint,p_operation jsonb) RETURNS jsonb
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
  PERFORM public.mutate_collection_labels_v1(principal,p_expected_catalog_revision,p_operation);
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
-- Remains closed until every organization writer uses this confirmation seam.
REVOKE ALL ON FUNCTION public.preview_label_organization_v1(bigint,jsonb) FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
