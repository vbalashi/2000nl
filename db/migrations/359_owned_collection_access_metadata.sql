BEGIN;
CREATE FUNCTION public.read_owned_collection_access_metadata_v1(p_collection_ids uuid[]) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,private,pg_temp AS $$
DECLARE principal uuid:=auth.uid(); result jsonb;
BEGIN
 IF principal IS NULL THEN RAISE EXCEPTION 'unauthorized' USING ERRCODE='42501'; END IF;
 IF p_collection_ids IS NULL OR cardinality(p_collection_ids)>200 OR COALESCE(array_ndims(p_collection_ids),1)>1 THEN
  RAISE EXCEPTION 'invalid_share_request' USING ERRCODE='22023'; END IF;
 IF array_position(p_collection_ids,NULL) IS NOT NULL THEN
  RAISE EXCEPTION 'invalid_share_request' USING ERRCODE='22023'; END IF;
 -- One snapshot and one bounded batch: publication remains visible at zero
 -- subscribers, while audience counts deduplicate all current accepted paths.
 WITH owned AS MATERIALIZED (
  SELECT id FROM public.user_word_lists WHERE user_id=principal AND id=ANY(p_collection_ids)
 ), direct AS MATERIALIZED (
  SELECT root.id,root.collection_id,root.access_lifetime FROM private.collection_sharing_roots root
  JOIN owned ON owned.id=root.collection_id WHERE root.owner_user_id=principal AND root.is_open
 ), groups AS MATERIALIZED (
  SELECT root.id,scope.collection_id,root.access_lifetime FROM private.label_sharing_roots root
  CROSS JOIN LATERAL private.label_subtree_owned_collections_v1(principal,root.label_id) scope
  JOIN owned ON owned.id=scope.collection_id WHERE root.owner_user_id=principal AND root.is_open
 ), publications AS (
  SELECT collection_id FROM direct UNION SELECT collection_id FROM groups
 ), readers AS (
  SELECT direct.collection_id,subscription.user_id FROM direct
  JOIN private.collection_sharing_subscriptions subscription ON subscription.root_id=direct.id
   AND subscription.access_lifetime=direct.access_lifetime AND subscription.is_active
  UNION ALL
  SELECT groups.collection_id,subscription.user_id FROM groups
  JOIN private.label_sharing_subscriptions subscription ON subscription.root_id=groups.id
   AND subscription.access_lifetime=groups.access_lifetime AND subscription.is_active
 ), counts AS (
  SELECT collection_id,count(DISTINCT user_id) AS subscribers FROM readers WHERE user_id<>principal GROUP BY collection_id
 )
 SELECT jsonb_build_object('collections',COALESCE(jsonb_agg(jsonb_build_object(
  'collectionId',owned.id,'isShared',publications.collection_id IS NOT NULL,
  'subscriberCount',COALESCE(counts.subscribers,0)) ORDER BY owned.id),'[]'::jsonb)) INTO result
 FROM owned LEFT JOIN publications ON publications.collection_id=owned.id LEFT JOIN counts ON counts.collection_id=owned.id;
 RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.read_owned_collection_access_metadata_v1(uuid[]) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.read_owned_collection_access_metadata_v1(uuid[]) TO authenticated;
COMMIT;
