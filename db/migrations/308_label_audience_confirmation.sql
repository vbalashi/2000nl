BEGIN;
-- Only server-prepared snapshots are accepted. The caller cannot inject an
-- audience or request a bypass of the existing ownership checks.
CREATE FUNCTION private.label_audience_revision_v1(p_owner uuid) RETURNS text
LANGUAGE sql STABLE SET search_path=pg_catalog,private,pg_temp AS $$
 SELECT encode(sha256(convert_to(private.label_audience_snapshot_v1(p_owner)::text,'UTF8')),'hex');
$$;
REVOKE ALL ON FUNCTION private.label_audience_revision_v1(uuid) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.commit_label_organization_v1(p_expected_catalog_revision bigint,p_operation jsonb,p_expected_audience_revision text) RETURNS jsonb
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
 result:=public.mutate_collection_labels_v1(principal,p_expected_catalog_revision,p_operation);
 IF EXISTS(SELECT 1 FROM private.label_sharing_roots root
  CROSS JOIN LATERAL private.label_subtree_borrowed_entries_v1(principal,root.label_id) borrowed
  WHERE root.owner_user_id=principal AND root.is_open) THEN
  RAISE EXCEPTION 'share_copy_required' USING ERRCODE='22023'; END IF;
 RETURN result;
EXCEPTION WHEN lock_not_available THEN RAISE EXCEPTION 'label_audience_changed' USING ERRCODE='40001';
END;
$$;
-- No API role can use this until the matching server preview is available.
REVOKE ALL ON FUNCTION public.commit_label_organization_v1(bigint,jsonb,text) FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
