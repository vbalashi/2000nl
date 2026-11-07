BEGIN;
-- Keep note and catalog projections on the same live authority paths.

CREATE OR REPLACE FUNCTION private.entry_note_scope_material_v1(p_user uuid, p_entries uuid[]) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'private', 'pg_temp'
    AS $$
DECLARE result jsonb:='[]'; item record;
BEGIN
  IF p_user IS NULL THEN RETURN result; END IF;
  IF p_entries IS NULL OR cardinality(p_entries)>50 THEN RAISE EXCEPTION 'invalid_note_scope' USING ERRCODE='22023'; END IF;
  FOR item IN
    WITH readable AS MATERIALIZED(
      SELECT DISTINCT entry.id FROM unnest(p_entries) requested(id)
      JOIN private.active_word_entries entry ON entry.id=requested.id
      WHERE private.entry_access_v1(p_user,entry.id,'browse')
    ), authors AS MATERIALIZED(
      SELECT DISTINCT entry.id AS entry_id,scope.owner_user_id
      FROM readable entry JOIN public.user_word_list_items membership ON membership.word_id=entry.id
      JOIN private.live_collection_access_paths_v1 scope ON scope.collection_id=membership.list_id
      WHERE scope.user_id=p_user AND scope.owner_user_id<>p_user
    ), participants AS (
      SELECT id AS entry_id,p_user AS owner_id,true AS is_own FROM readable
      UNION ALL SELECT entry_id,owner_user_id,false FROM authors
    )
    SELECT participant.entry_id,participant.owner_id,participant.is_own,note.id AS note_id,note.notes,
      COALESCE(clock.revision,0)::text AS revision
    FROM participants participant
    LEFT JOIN public.user_word_notes note ON note.user_id=participant.owner_id AND note.word_entry_id=participant.entry_id
    LEFT JOIN private.user_word_note_revisions clock ON clock.user_id=participant.owner_id AND clock.word_entry_id=participant.entry_id
    ORDER BY participant.entry_id,participant.is_own DESC,participant.owner_id
    LIMIT 1001
  LOOP
    IF jsonb_array_length(result)>=1000 THEN RAISE EXCEPTION 'note_material_too_large' USING ERRCODE='22023'; END IF;
    result:=result||jsonb_build_array(jsonb_build_object('entryId',item.entry_id,'ownerUserId',item.owner_id,
      'noteId',item.note_id,'text',item.notes,'revision',item.revision,'isOwn',item.is_own));
    IF octet_length(result::text)>1048576 THEN RAISE EXCEPTION 'note_material_too_large' USING ERRCODE='22023'; END IF;
  END LOOP;
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION private.read_received_collection_page_v1(p_after uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 100) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'private', 'pg_temp'
    AS $$
DECLARE principal uuid:=(select auth.uid());
BEGIN
 IF principal IS NULL THEN RAISE EXCEPTION 'unauthorized' USING ERRCODE='42501'; END IF;
 IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'invalid_catalog_request' USING ERRCODE='22023'; END IF;
 RETURN (
  WITH candidates AS MATERIALIZED (
   SELECT DISTINCT l.id,l.name,l.created_at,s.owner_user_id FROM private.live_collection_access_paths_v1 s
   JOIN public.user_word_lists l ON l.id=s.collection_id
   WHERE s.user_id=principal AND s.owner_user_id<>principal AND (p_after IS NULL OR l.id>p_after)
   ORDER BY l.id LIMIT p_limit+1
  ), page AS MATERIALIZED (SELECT * FROM candidates ORDER BY id LIMIT p_limit),
  members AS MATERIALIZED (
   SELECT page.id AS collection_id,entry.id,entry.dictionary_id FROM page
   JOIN public.user_word_list_items item ON item.list_id=page.id
   JOIN private.active_word_entries entry ON entry.id=item.word_id
  ), dictionaries AS MATERIALIZED (
   SELECT dictionary.id,dictionary.kind,dictionary.owner_user_id,
    CASE WHEN dictionary.kind<>'user' THEN public.can_browse_dictionary(principal,dictionary.id) ELSE false END AS readable
   FROM (SELECT DISTINCT dictionary_id FROM members) selected JOIN public.dictionaries dictionary ON dictionary.id=selected.dictionary_id
  ), shared AS MATERIALIZED (
   SELECT DISTINCT granted.entry_id FROM private.shared_author_entry_memberships_v1 granted
   WHERE granted.user_id=principal AND granted.entry_id IN(SELECT id FROM members)
  ), counts AS MATERIALIZED (
   SELECT member.collection_id,count(*) AS item_count FROM members member LEFT JOIN dictionaries dictionary ON dictionary.id=member.dictionary_id
   WHERE member.dictionary_id IS NULL OR dictionary.readable OR
    (dictionary.kind='user' AND (dictionary.owner_user_id=principal OR member.id IN(SELECT entry_id FROM shared)))
   GROUP BY member.collection_id
  )
  SELECT jsonb_build_object('revision',COALESCE((SELECT revision FROM private.collection_label_catalogs WHERE user_id=principal),0),
   'collections',COALESCE((SELECT jsonb_agg(jsonb_build_object(
    'id',page.id,'name',page.name,'createdAt',page.created_at,'ownerUserId',page.owner_user_id,'role','viewer',
    'itemCount',COALESCE((SELECT item_count FROM counts WHERE collection_id=page.id),0),
    'labelIds',COALESCE((SELECT jsonb_agg(label_id ORDER BY label_id) FROM private.received_collection_label_placements placement
      WHERE placement.user_id=principal AND placement.collection_id=page.id),'[]'::jsonb)
   ) ORDER BY page.id) FROM page),'[]'::jsonb),
   'nextCursor',CASE WHEN (SELECT count(*) FROM candidates)>p_limit THEN (SELECT id FROM page ORDER BY id DESC LIMIT 1) ELSE NULL END)
 );
END;
$$;

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
  )
  SELECT DISTINCT item.word_id FROM public.user_word_list_items item
  JOIN collections ON collections.id=item.list_id
  UNION
  SELECT item.word_id FROM public.word_list_items item
  WHERE p_material->>'kind'='collection' AND p_material->>'collectionType'='curated'
    AND item.list_id=(p_material->>'id')::uuid;
$$;

CREATE OR REPLACE FUNCTION private.training_collection_catalog_cohort_v1(p_user_id uuid, p_query text, p_language_code text, p_after_id uuid, p_after_key text, p_limit integer, p_collection_ids uuid[] DEFAULT NULL::uuid[]) RETURNS TABLE(collection_id uuid, collection_name text, ownership text, available_item_count bigint, name_key text, eligible boolean)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'private', 'pg_temp'
    AS $$
 WITH resources AS MATERIALIZED (
  SELECT list.id,list.name,list.user_id AS owner_id,COALESCE(list.primary_language_code,list.language_code) AS language_code,
   'owned'::text AS ownership,lower(list.name) COLLATE "C" AS name_key
  FROM public.user_word_lists list WHERE list.user_id=p_user_id AND (p_collection_ids IS NULL OR list.id=ANY(p_collection_ids))
  UNION ALL
  SELECT DISTINCT list.id,list.name,scope.owner_user_id,COALESCE(list.primary_language_code,list.language_code),
   'received',lower(list.name) COLLATE "C"
  FROM private.live_collection_access_paths_v1 scope
  JOIN public.user_word_lists list ON list.id=scope.collection_id
  WHERE scope.user_id=p_user_id AND scope.owner_user_id<>p_user_id AND (p_collection_ids IS NULL OR list.id=ANY(p_collection_ids))
 ), cohort AS MATERIALIZED (
  SELECT * FROM resources WHERE strpos(lower(name),lower(p_query))>0
   AND (p_after_id IS NULL OR (name_key,id)>(p_after_key COLLATE "C",p_after_id))
  ORDER BY name_key COLLATE "C",id LIMIT p_limit
 ), members AS MATERIALIZED (
  SELECT cohort.id AS collection_id,cohort.owner_id,cohort.ownership,entry.id,entry.dictionary_id,entry.management_kind,entry.language_code
  FROM cohort JOIN public.user_word_list_items item ON item.list_id=cohort.id
  JOIN private.active_word_entries entry ON entry.id=item.word_id
 ), dictionaries AS MATERIALIZED (
  SELECT dictionary.id,dictionary.kind,dictionary.owner_user_id,
   CASE WHEN dictionary.kind<>'user' THEN public.can_access_dictionary(p_user_id,dictionary.id,'read') ELSE false END AS readable
  FROM (SELECT DISTINCT dictionary_id FROM members) selected JOIN public.dictionaries dictionary ON dictionary.id=selected.dictionary_id
 ), borrowed AS MATERIALIZED (
  SELECT DISTINCT member.id FROM members member JOIN dictionaries dictionary ON dictionary.id=member.dictionary_id
  WHERE dictionary.kind='user' AND dictionary.owner_user_id<>p_user_id
   AND NOT(member.ownership='received' AND dictionary.owner_user_id=member.owner_id AND member.management_kind='user')
 ), borrowed_shared AS MATERIALIZED (
  SELECT DISTINCT grant_entry.entry_id FROM private.shared_author_entry_memberships_v1 grant_entry
  WHERE grant_entry.user_id=p_user_id AND grant_entry.entry_id IN(SELECT id FROM borrowed)
 ), counts AS MATERIALIZED (
  SELECT member.collection_id,count(*) FILTER(WHERE p_language_code IS NULL OR member.language_code=p_language_code) AS item_count,
   count(DISTINCT member.language_code) AS language_count
  FROM members member LEFT JOIN dictionaries dictionary ON dictionary.id=member.dictionary_id
  WHERE member.dictionary_id IS NULL OR dictionary.readable OR (dictionary.kind='user' AND
   (dictionary.owner_user_id=p_user_id OR
    (member.ownership='received' AND dictionary.owner_user_id=member.owner_id AND member.management_kind='user') OR
    member.id IN(SELECT entry_id FROM borrowed_shared)))
  GROUP BY member.collection_id
 ) SELECT cohort.id,cohort.name,cohort.ownership,COALESCE(counts.item_count,0),cohort.name_key,
   CASE WHEN cohort.ownership='received' THEN COALESCE(counts.item_count,0)>0
    ELSE p_language_code IS NULL OR cohort.language_code=p_language_code OR
     (COALESCE(counts.language_count,0)>1 AND COALESCE(counts.item_count,0)>0) END
 FROM cohort LEFT JOIN counts ON counts.collection_id=cohort.id
 ORDER BY cohort.name_key COLLATE "C",cohort.id
$$;

COMMIT;
