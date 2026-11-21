-- Resolve a received label through its own active group subscription.
BEGIN;

CREATE OR REPLACE FUNCTION private.library_material_entry_ids_v1(p_user_id uuid, p_material jsonb) RETURNS TABLE(entry_id uuid)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'private', 'pg_temp'
    AS $$
  WITH RECURSIVE labels AS (
    SELECT id FROM private.collection_labels
    WHERE user_id=p_user_id AND id=(p_material->>'id')::uuid AND p_material->>'kind'='label'
    UNION
    SELECT child.id FROM private.collection_labels child
    JOIN labels parent ON child.parent_id=parent.id WHERE child.user_id=p_user_id
  ), collections AS (
    SELECT list.id FROM public.user_word_lists list
    WHERE (list.user_id=p_user_id OR EXISTS (
      SELECT 1 FROM private.shared_collection_ids_v1(p_user_id) shared
      WHERE shared.collection_id=list.id
    )) AND p_material->>'kind'='collection'
      AND p_material->>'collectionType'='user' AND list.id=(p_material->>'id')::uuid
    UNION
    SELECT assignment.collection_id FROM private.collection_label_assignments assignment
    JOIN labels ON labels.id=assignment.label_id WHERE assignment.user_id=p_user_id
    UNION
    SELECT placement.collection_id FROM private.received_collection_label_placements placement
    JOIN labels ON labels.id=placement.label_id
    JOIN private.live_collection_access_paths_v1 scope ON scope.collection_id=placement.collection_id
      AND scope.user_id=placement.user_id
    WHERE placement.user_id=p_user_id
    UNION
    SELECT scope.collection_id FROM private.live_label_sharing_collections_v1 scope
    WHERE p_material->>'kind'='label' AND scope.user_id=p_user_id
      AND scope.label_id=(p_material->>'id')::uuid
  )
  SELECT DISTINCT item.word_id FROM public.user_word_list_items item
  JOIN collections ON collections.id=item.list_id
  UNION
  SELECT item.word_id FROM public.word_list_items item
  WHERE p_material->>'kind'='collection' AND p_material->>'collectionType'='curated'
    AND item.list_id=(p_material->>'id')::uuid;
$$;

CREATE FUNCTION private.library_label_accessible_v1(p_user uuid,p_label uuid) RETURNS boolean
LANGUAGE sql STABLE SET search_path=pg_catalog,public,private,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM private.collection_labels WHERE user_id=p_user AND id=p_label)
   OR EXISTS(
    SELECT 1 FROM private.label_sharing_roots root
    JOIN private.label_sharing_subscriptions subscription ON subscription.root_id=root.id
      AND subscription.user_id=p_user AND subscription.access_lifetime=root.access_lifetime
    WHERE root.label_id=p_label AND root.is_open AND subscription.is_active
   );
$$;
REVOKE ALL ON FUNCTION private.library_label_accessible_v1(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.library_label_accessible_v1(uuid,uuid) TO postgres;

-- Update only the label gate; filter validation, cursors, and function privileges stay intact.
DO $$
DECLARE signature regprocedure; definition text;
 old_gate constant text:='EXISTS(SELECT 1 FROM private.collection_labels WHERE user_id=p_user_id AND id=(p_material->>''id'')::uuid)';
 new_gate constant text:='private.library_label_accessible_v1(p_user_id,(p_material->>''id'')::uuid)';
BEGIN
 FOREACH signature IN ARRAY ARRAY[
   'public.lookup_platform_v2_library_material_entries(uuid,text,text,uuid[],text,integer,integer,jsonb,jsonb)'::regprocedure,
   'private.search_library_category_pre375(uuid,text,text,uuid[],jsonb,jsonb,text,integer,text)'::regprocedure
 ] LOOP
  definition:=pg_get_functiondef(signature);
  IF length(definition)-length(replace(definition,old_gate,''))<>length(old_gate) THEN
   RAISE EXCEPTION 'unexpected Library label gate in %',signature;
  END IF;
  EXECUTE replace(definition,old_gate,new_gate);
 END LOOP;
END;
$$;

-- Bulk actions use the same source cohort when fencing concurrent access changes.
CREATE OR REPLACE FUNCTION private.words_bulk_material_sources_v1(p_user uuid,p_material jsonb) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,private,pg_temp AS $$
DECLARE result jsonb;
BEGIN
 IF p_material IS NULL OR (p_material->>'kind'='collection' AND p_material->>'collectionType'='curated') THEN RETURN '[]'::jsonb; END IF;
 IF to_regclass('private.received_collection_label_placements') IS NULL OR to_regclass('private.live_collection_access_paths_v1') IS NULL THEN
  RAISE EXCEPTION 'collection_audience_unavailable' USING ERRCODE='55000'; END IF;
 EXECUTE $q$
 WITH RECURSIVE labels AS (
  SELECT id FROM private.collection_labels WHERE user_id=$1 AND id=($2->>'id')::uuid AND $2->>'kind'='label'
  UNION SELECT child.id FROM private.collection_labels child JOIN labels parent ON child.parent_id=parent.id WHERE child.user_id=$1
 ), collections AS (
  SELECT list.id FROM public.user_word_lists list WHERE $2->>'kind'='collection' AND $2->>'collectionType'='user' AND list.id=($2->>'id')::uuid
  UNION SELECT assignment.collection_id FROM private.collection_label_assignments assignment JOIN labels ON labels.id=assignment.label_id WHERE assignment.user_id=$1
  UNION SELECT placement.collection_id FROM private.received_collection_label_placements placement JOIN labels ON labels.id=placement.label_id
   JOIN private.live_collection_access_paths_v1 path ON path.collection_id=placement.collection_id AND path.user_id=placement.user_id WHERE placement.user_id=$1
  UNION SELECT scope.collection_id FROM private.live_label_sharing_collections_v1 scope
   WHERE $2->>'kind'='label' AND scope.user_id=$1 AND scope.label_id=($2->>'id')::uuid
 ) SELECT COALESCE(jsonb_agg(jsonb_build_object('id',list.id,'owner',list.user_id) ORDER BY list.id),'[]'::jsonb)
 FROM collections JOIN public.user_word_lists list ON list.id=collections.id
 $q$ INTO result USING p_user,p_material;
 RETURN result;
END;
$$;
COMMIT;
