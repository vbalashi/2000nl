BEGIN;
CREATE FUNCTION public.preflight_label_share_v1(p_label_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,private,pg_temp AS $$
DECLARE principal uuid:=auth.uid();
BEGIN
 IF principal IS NULL OR NOT EXISTS(SELECT 1 FROM private.collection_labels WHERE id=p_label_id AND user_id=principal) THEN
  RAISE EXCEPTION 'share_unavailable' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object('labelId',p_label_id,'collections',COALESCE((
  SELECT jsonb_agg(jsonb_build_object('collectionId',borrowed.collection_id,'name',list.name,'borrowedCount',borrowed.n) ORDER BY borrowed.collection_id)
  FROM (SELECT collection_id,count(*) AS n FROM private.label_subtree_borrowed_entries_v1(principal,p_label_id) GROUP BY collection_id) borrowed
  JOIN public.user_word_lists list ON list.id=borrowed.collection_id AND list.user_id=principal),'[]'::jsonb));
END;
$$;
REVOKE ALL ON FUNCTION public.preflight_label_share_v1(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.preflight_label_share_v1(uuid) TO authenticated;
COMMIT;
