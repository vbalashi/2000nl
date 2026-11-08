BEGIN;
CREATE FUNCTION private.label_audience_snapshot_v1(p_owner uuid) RETURNS jsonb
LANGUAGE sql STABLE SET search_path=pg_catalog,public,private,pg_temp AS $$
 SELECT jsonb_build_object(
  'catalogRevision',COALESCE((SELECT revision FROM private.collection_label_catalogs WHERE user_id=p_owner),0),
  'roots',COALESCE((SELECT jsonb_agg(jsonb_build_object('rootId',id,'revision',revision,'lifetime',access_lifetime,'open',is_open) ORDER BY id)
   FROM private.label_sharing_roots WHERE owner_user_id=p_owner),'[]'::jsonb),
  'paths',COALESCE((SELECT jsonb_agg(jsonb_build_object('userId',user_id,'collectionId',collection_id,'rootId',root_id,'kind',root_kind,'lifetime',access_lifetime)
   ORDER BY user_id,collection_id,root_kind,root_id) FROM private.live_collection_access_paths_v1 WHERE owner_user_id=p_owner),'[]'::jsonb),
  'memberships',COALESCE((SELECT jsonb_agg(jsonb_build_object('collectionId',list.id,'entryId',item.word_id) ORDER BY list.id,item.word_id)
   FROM public.user_word_lists list JOIN public.user_word_list_items item ON item.list_id=list.id WHERE list.user_id=p_owner),'[]'::jsonb)
 );
$$;
REVOKE ALL ON FUNCTION private.label_audience_snapshot_v1(uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION private.label_audience_delta_v1(p_before jsonb,p_after jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,pg_temp AS $$
 WITH before_pairs AS (
  SELECT DISTINCT value->>'userId' AS user_id,value->>'collectionId' AS collection_id FROM jsonb_array_elements(p_before->'paths')
 ), after_pairs AS (
  SELECT DISTINCT value->>'userId' AS user_id,value->>'collectionId' AS collection_id FROM jsonb_array_elements(p_after->'paths')
 ), added AS (SELECT * FROM after_pairs EXCEPT SELECT * FROM before_pairs),
 removed AS (SELECT * FROM before_pairs EXCEPT SELECT * FROM after_pairs)
 SELECT jsonb_build_object(
  'added',COALESCE((SELECT jsonb_agg(jsonb_build_object('userId',user_id,'collectionId',collection_id) ORDER BY user_id,collection_id) FROM added),'[]'::jsonb),
  'removed',COALESCE((SELECT jsonb_agg(jsonb_build_object('userId',user_id,'collectionId',collection_id) ORDER BY user_id,collection_id) FROM removed),'[]'::jsonb),
  'pathsChanged',(p_before->'paths') IS DISTINCT FROM (p_after->'paths'));
$$;
REVOKE ALL ON FUNCTION private.label_audience_delta_v1(jsonb,jsonb) FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
