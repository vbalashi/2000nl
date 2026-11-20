-- Fresh installations. Extend the authorized group page with presentation metadata.
BEGIN;

CREATE FUNCTION public.read_received_group_catalog_v1(
 p_query text, p_sort text, p_label_id uuid, p_language_code text,
 p_cursor jsonb, p_limit integer, p_ownership text
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,private,pg_temp SET jit=off AS $$
DECLARE page jsonb; tree jsonb; author uuid;
BEGIN
 -- This read validates the active subscription and scopes the page before filtering.
 -- Both reads use the same statement snapshot.
 page := public.read_personal_collection_catalog_v2(
  p_query,p_sort,'group',p_label_id,p_language_code,p_cursor,p_limit,p_ownership
 );
 SELECT owner_user_id INTO STRICT author FROM private.label_sharing_roots WHERE label_id=p_label_id;

 WITH RECURSIVE page_collections AS MATERIALIZED (
  SELECT id FROM jsonb_to_recordset(page->'collections') AS row(id uuid)
 ), subtree AS (
  SELECT label.id,NULL::uuid AS parent_id,label.name
  FROM private.collection_labels label
  WHERE label.user_id=author AND label.id=p_label_id AND EXISTS(SELECT 1 FROM page_collections)
  UNION ALL
  SELECT child.id,child.parent_id,child.name
  FROM subtree parent JOIN private.collection_labels child ON child.user_id=author AND child.parent_id=parent.id
 ), placements AS MATERIALIZED (
  SELECT assignment.collection_id,assignment.label_id
  FROM page_collections row
  JOIN private.collection_label_assignments assignment ON assignment.user_id=author AND assignment.collection_id=row.id
  JOIN subtree label ON label.id=assignment.label_id
 ), visible_labels AS (
  SELECT label_id AS id FROM placements
  UNION
  SELECT label.parent_id FROM visible_labels visible JOIN subtree label ON label.id=visible.id
  WHERE label.parent_id IS NOT NULL
 )
 SELECT jsonb_build_object(
  'revision',COALESCE((SELECT revision FROM private.collection_label_catalogs WHERE user_id=author),0),
  'labels',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',label.id,'parentId',label.parent_id,'name',label.name) ORDER BY label.id)
    FROM subtree label JOIN visible_labels visible ON visible.id=label.id),'[]'::jsonb),
  'placements',COALESCE((SELECT jsonb_object_agg(collection_id,label_ids) FROM (
    SELECT collection_id,jsonb_agg(label_id ORDER BY label_id) AS label_ids FROM placements GROUP BY collection_id
  ) assigned),'{}'::jsonb)
 ) INTO tree;
 RETURN page || jsonb_build_object('groupTree',tree);
END;
$$;

REVOKE ALL ON FUNCTION public.read_received_group_catalog_v1(text,text,uuid,text,jsonb,integer,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.read_received_group_catalog_v1(text,text,uuid,text,jsonb,integer,text) TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
