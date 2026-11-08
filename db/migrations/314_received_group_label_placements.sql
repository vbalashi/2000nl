BEGIN;
CREATE OR REPLACE FUNCTION private.set_received_collection_labels_v1(p_collection_id uuid, p_expected_revision bigint, p_label_ids uuid[]) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'private', 'pg_temp'
    AS $$
DECLARE principal uuid:=(select auth.uid());
 revision integer; requested uuid[]; previous uuid[]; author uuid;
BEGIN
 IF principal IS NULL THEN RAISE EXCEPTION 'unauthorized' USING ERRCODE='42501'; END IF;
 IF p_collection_id IS NULL OR p_expected_revision IS NULL OR p_expected_revision NOT BETWEEN 0 AND 2147483646
   OR p_label_ids IS NULL OR cardinality(p_label_ids)>1000 OR COALESCE(array_ndims(p_label_ids),1)<>1 OR array_position(p_label_ids,NULL) IS NOT NULL THEN
  RAISE EXCEPTION 'invalid_label_operation' USING ERRCODE='22023';
 END IF;
 -- Preliminary access check avoids locking an outsider's arbitrary resource.
 IF NOT EXISTS(SELECT 1 FROM private.live_collection_access_paths_v1 scope
  WHERE scope.user_id=principal AND scope.collection_id=p_collection_id AND scope.owner_user_id<>principal) THEN
  RAISE EXCEPTION 'collection_not_found' USING ERRCODE='42501';
 END IF;
 PERFORM 1 FROM auth.users WHERE id=principal FOR KEY SHARE NOWAIT;
 IF NOT FOUND THEN RAISE EXCEPTION 'unauthorized' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM public.user_word_lists WHERE id=p_collection_id FOR KEY SHARE NOWAIT;
 IF NOT FOUND THEN RAISE EXCEPTION 'collection_not_found' USING ERRCODE='42501'; END IF;
 -- The author fence stabilizes all independent paths, including groups.
 FOR author IN SELECT DISTINCT scope.owner_user_id FROM private.live_collection_access_paths_v1 scope
  WHERE scope.user_id=principal AND scope.collection_id=p_collection_id ORDER BY scope.owner_user_id LOOP
  IF NOT pg_try_advisory_xact_lock_shared(hashtextextended('collection-author-scope:'||author::text,0)) THEN
   RAISE EXCEPTION 'label_catalog_conflict' USING ERRCODE='40001'; END IF;
 END LOOP;
 IF NOT EXISTS(SELECT 1 FROM private.live_collection_access_paths_v1 scope
  WHERE scope.user_id=principal AND scope.collection_id=p_collection_id AND scope.owner_user_id<>principal) THEN
  RAISE EXCEPTION 'collection_not_found' USING ERRCODE='42501'; END IF;
 -- Recipient account -> source collection -> try author admission -> own label catalog.
 -- Label deletion never takes sharing-root locks.
 INSERT INTO private.collection_label_catalogs(user_id) VALUES(principal) ON CONFLICT DO NOTHING;
 SELECT c.revision INTO revision FROM private.collection_label_catalogs c WHERE c.user_id=principal FOR UPDATE;
 IF revision<>p_expected_revision THEN RAISE EXCEPTION 'label_catalog_conflict' USING ERRCODE='40001'; END IF;
 SELECT COALESCE(array_agg(DISTINCT id ORDER BY id),ARRAY[]::uuid[]) INTO requested FROM unnest(p_label_ids) id;
 IF EXISTS(SELECT 1 FROM unnest(requested) requested_label(id) WHERE NOT EXISTS(
  SELECT 1 FROM private.collection_labels label WHERE label.user_id=principal AND label.id=requested_label.id
 )) THEN RAISE EXCEPTION 'label_not_found' USING ERRCODE='22023'; END IF;
 SELECT COALESCE(array_agg(label_id ORDER BY label_id),ARRAY[]::uuid[]) INTO previous
 FROM private.received_collection_label_placements WHERE user_id=principal AND collection_id=p_collection_id;
 IF requested IS DISTINCT FROM previous THEN
  IF revision>=2147483646 OR (SELECT count(*) FROM private.received_collection_label_placements WHERE user_id=principal)
    -cardinality(previous)+cardinality(requested)>10000 THEN
   RAISE EXCEPTION 'label_catalog_limit' USING ERRCODE='22023';
  END IF;
  DELETE FROM private.received_collection_label_placements WHERE user_id=principal AND collection_id=p_collection_id;
  INSERT INTO private.received_collection_label_placements(user_id,collection_id,label_id)
   SELECT principal,p_collection_id,id FROM unnest(requested) id;
  UPDATE private.collection_label_catalogs c SET revision=c.revision+1 WHERE c.user_id=principal RETURNING c.revision INTO revision;
 END IF;
 RETURN jsonb_build_object('collectionId',p_collection_id,'revision',revision,'labelIds',to_jsonb(requested));
END;
$$;
COMMIT;
