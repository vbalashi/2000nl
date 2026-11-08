BEGIN;
CREATE FUNCTION public.read_collection_access_paths_v1(p_collection_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,private,pg_temp AS $$
DECLARE principal uuid:=auth.uid(); owner uuid;
BEGIN
 IF principal IS NULL THEN RAISE EXCEPTION 'unauthorized' USING ERRCODE='42501'; END IF;
 SELECT user_id INTO owner FROM public.user_word_lists WHERE id=p_collection_id;
 IF NOT FOUND OR (owner<>principal AND NOT EXISTS(SELECT 1 FROM private.live_collection_access_paths_v1
  WHERE user_id=principal AND collection_id=p_collection_id)) THEN
  RAISE EXCEPTION 'collection_unavailable' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object('collectionId',p_collection_id,'isOwner',owner=principal,
  'directSubscription',EXISTS(SELECT 1 FROM private.live_collection_access_paths_v1
   WHERE user_id=principal AND collection_id=p_collection_id AND root_kind='collection'),
  'groups',COALESCE((SELECT jsonb_agg(jsonb_build_object('labelId',label.id,'name',label.name) ORDER BY label.id)
   FROM private.live_collection_access_paths_v1 path JOIN private.label_sharing_roots root ON root.id=path.root_id
   JOIN private.collection_labels label ON label.id=root.label_id
   WHERE path.user_id=principal AND path.collection_id=p_collection_id AND path.root_kind='label'),'[]'::jsonb));
END;
$$;
REVOKE ALL ON FUNCTION public.read_collection_access_paths_v1(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.read_collection_access_paths_v1(uuid) TO authenticated;
COMMIT;
