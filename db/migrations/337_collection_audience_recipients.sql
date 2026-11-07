BEGIN;
CREATE FUNCTION private.collection_audience_recipients_v1(p_owner uuid,p_collection uuid) RETURNS jsonb
LANGUAGE sql STABLE SET search_path=pg_catalog,private,pg_temp AS $$
 SELECT COALESCE(jsonb_agg(jsonb_build_object('userId',recipient.user_id,'paths',recipient.paths) ORDER BY recipient.user_id),'[]'::jsonb)
 FROM (SELECT path.user_id,jsonb_agg(jsonb_build_object('rootId',path.root_id,'kind',path.root_kind,'lifetime',path.access_lifetime)
  ORDER BY path.root_kind,path.root_id) AS paths
 FROM private.live_collection_access_paths_v1 path
 WHERE path.owner_user_id=p_owner AND path.collection_id=p_collection AND path.user_id<>p_owner
 GROUP BY path.user_id) recipient;
$$;
REVOKE ALL ON FUNCTION private.collection_audience_recipients_v1(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
