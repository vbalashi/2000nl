-- Hide curated collections when none of their active entries can be browsed.
BEGIN;
-- Optional catalog audience, configured by the installation operator.
-- Absence of rows retains the ordinary dictionary-based visibility.
CREATE TABLE private.curated_collection_catalog_groups (
  collection_id uuid NOT NULL REFERENCES public.word_lists(id) ON DELETE CASCADE,
  group_id uuid NOT NULL REFERENCES public.dictionary_access_groups(id) ON DELETE RESTRICT,
  PRIMARY KEY (collection_id, group_id)
);
ALTER TABLE private.curated_collection_catalog_groups ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.curated_collection_catalog_groups FROM PUBLIC, anon, authenticated, service_role;
CREATE FUNCTION private.curated_collection_in_catalog_v1(p_user_id uuid, p_collection_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, private, pg_temp AS $$
  SELECT NOT EXISTS (SELECT 1 FROM private.curated_collection_catalog_groups a WHERE a.collection_id=p_collection_id)
    OR EXISTS (SELECT 1 FROM private.curated_collection_catalog_groups a
      JOIN public.dictionary_access_group_members m ON m.group_id=a.group_id
      WHERE a.collection_id=p_collection_id AND m.user_id=p_user_id)
$$;
REVOKE ALL ON FUNCTION private.curated_collection_in_catalog_v1(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
CREATE OR REPLACE FUNCTION public.get_available_word_lists(p_user_id uuid, p_language_code text DEFAULT NULL::text, p_list_type text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
    v_language_code text := NULLIF(trim(COALESCE(p_language_code, '')), '');
    v_result jsonb;
BEGIN
    IF p_user_id IS DISTINCT FROM (select auth.uid()) THEN
        RAISE EXCEPTION 'unauthorized: user_id does not match authenticated user';
    END IF;

    WITH entry_sources AS MATERIALIZED (
        SELECT id, dictionary_id FROM private.active_word_entries
    ), selected_lists AS MATERIALIZED (
        SELECT id FROM public.word_lists
        WHERE (p_list_type IS NULL OR p_list_type = 'curated')
          AND (v_language_code IS NULL OR language_code = v_language_code)
    ), curated_source_counts AS MATERIALIZED (
        SELECT item.list_id, entry.dictionary_id, count(*)::int AS item_count,
            entry.dictionary_id IS NULL
                OR public.can_browse_dictionary(p_user_id, entry.dictionary_id) AS accessible
        FROM public.word_list_items item
        JOIN selected_lists selected ON selected.id = item.list_id
        JOIN entry_sources entry ON entry.id = item.word_id
        GROUP BY item.list_id, entry.dictionary_id
    ), curated AS (
        SELECT jsonb_build_object(
            'id', l.id,
            'list_type', 'curated',
            'name', l.name,
            'description', l.description,
            'language_code', l.language_code,
            'primary_language_code', l.primary_language_code,
            'is_mixed_language', false,
            'is_primary', l.is_primary,
            'sort_order', l.sort_order,
            'word_list_items', jsonb_build_array(jsonb_build_object(
                'count', availability.item_count,
                'available_count', availability.available_item_count,
                'unavailable_source_count', availability.unavailable_source_count
            ))
        ) AS row,
        COALESCE(l.sort_order, 2147483647) AS sort_order,
        l.is_primary,
        l.name,
        NULL::timestamptz AS created_at
        FROM word_lists l
        CROSS JOIN LATERAL (
            SELECT
                COALESCE(sum(source.item_count), 0)::int AS item_count,
                COALESCE(sum(source.item_count) FILTER (WHERE source.accessible), 0)::int
                    AS available_item_count,
                count(*) FILTER (
                    WHERE source.dictionary_id IS NOT NULL AND NOT source.accessible
                )::int AS unavailable_source_count
            FROM curated_source_counts source
            WHERE source.list_id = l.id
        ) AS availability
        WHERE (p_list_type IS NULL OR p_list_type = 'curated')
          AND (v_language_code IS NULL OR l.language_code = v_language_code)
          AND availability.available_item_count > 0
          AND private.curated_collection_in_catalog_v1(p_user_id, l.id)
    ),
    user_lists AS (
        SELECT jsonb_build_object(
            'id', l.id,
            'list_type', 'user',
            'name', l.name,
            'description', l.description,
            'language_code', l.language_code,
            'primary_language_code', l.primary_language_code,
            'is_mixed_language', item_languages.language_count > 1,
            'created_at', l.created_at,
            'user_word_list_items', jsonb_build_array(jsonb_build_object(
                'count', availability.item_count,
                'available_count', availability.available_item_count,
                'unavailable_source_count', availability.unavailable_source_count
            ))
        ) AS row,
        2147483647 AS sort_order,
        false AS is_primary,
        l.name,
        l.created_at
        FROM user_word_lists l
        JOIN LATERAL (
            SELECT
                COUNT(*)::int AS item_count,
                COUNT(DISTINCT w.language_code)::int AS language_count
            FROM user_word_list_items item
            JOIN private.active_word_entries w ON w.id = item.word_id
            WHERE item.list_id = l.id
        ) item_languages ON true
        JOIN LATERAL (
            SELECT
                COALESCE(sum(source.item_count), 0)::int AS item_count,
                COALESCE(sum(source.item_count) FILTER (WHERE source.accessible), 0)::int
                    AS available_item_count,
                count(*) FILTER (
                    WHERE source.dictionary_id IS NOT NULL AND NOT source.accessible
                )::int AS unavailable_source_count
            FROM (
                SELECT
                    entry.dictionary_id,
                    count(*)::int AS item_count,
                    entry.dictionary_id IS NULL
                        OR can_browse_dictionary(p_user_id, entry.dictionary_id)
                        AS accessible
                FROM user_word_list_items item
                JOIN private.active_word_entries entry ON entry.id = item.word_id
                WHERE item.list_id = l.id
                GROUP BY entry.dictionary_id
            ) AS source
        ) AS availability ON true
        WHERE (p_list_type IS NULL OR p_list_type = 'user')
          AND l.user_id = p_user_id
          AND (
            v_language_code IS NULL
            OR item_languages.language_count > 1
            OR (
                item_languages.language_count <= 1
                AND (
                    COALESCE(l.primary_language_code, l.language_code) = v_language_code
                    OR (l.primary_language_code IS NULL AND l.language_code = v_language_code)
                )
            )
          )
    ),
    combined AS (
        SELECT row, 0 AS group_order, sort_order, is_primary, name, created_at
        FROM curated
        UNION ALL
        SELECT row, 1 AS group_order, sort_order, is_primary, name, created_at
        FROM user_lists
    )
    SELECT COALESCE(
        jsonb_agg(row ORDER BY group_order, sort_order, is_primary DESC, name ASC, created_at DESC),
        '[]'::jsonb
    )
    INTO v_result
    FROM combined;

    RETURN v_result;
END;
$$;
CREATE OR REPLACE FUNCTION public.get_training_material_progress_v1(p_language_code text) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'private', 'pg_temp'
    AS $_$
DECLARE
 principal uuid := (select auth.uid());
 v_now timestamptz := clock_timestamp();
 v_timezone text;
 v_start timestamptz;
 v_end timestamptz;
 v_disabled jsonb;
 v_materials jsonb;
BEGIN
 IF principal IS NULL THEN RETURN jsonb_build_object('error','unauthorized'); END IF;
 IF p_language_code IS NULL OR p_language_code !~ '^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$' THEN
  RETURN jsonb_build_object('error','invalid_material_scope'); END IF;
 v_timezone := private.training_user_timezone_v1(principal);
 SELECT bounds.start_at,bounds.end_at INTO v_start,v_end FROM private.training_study_day_bounds_v1(v_now,v_timezone) bounds;
 SELECT settings.material_preferences->'disabledDictionaryIds' INTO v_disabled
  FROM public.user_settings settings WHERE settings.user_id=principal;
 v_disabled := COALESCE(v_disabled,'[]'::jsonb);
 WITH readable AS (
  SELECT d.id,d.name,d.kind FROM public.dictionaries d
  WHERE d.language_code=p_language_code AND public.can_access_dictionary(principal,d.id,'read')
   AND (d.kind='user' OR NOT (v_disabled ? d.id::text))
 ), entries AS (
  SELECT w.id,w.dictionary_id FROM public.word_entries w
  WHERE w.language_code=p_language_code AND (w.dictionary_id IS NULL OR w.dictionary_id IN (SELECT id FROM readable))
 ), card_state AS (
  SELECT s.entry_id,
   bool_or(s.fsrs_enabled) AS started,
   count(*) FILTER (WHERE s.fsrs_enabled AND NOT s.hidden AND s.next_review_at<v_end
    AND (s.frozen_until IS NULL OR s.frozen_until<=v_now)
    AND NOT EXISTS (SELECT 1 FROM public.user_review_log r WHERE r.user_id=principal AND r.word_id=s.entry_id
     AND r.mode=s.card_type_id AND r.review_type='new' AND r.reviewed_at>=v_start AND r.reviewed_at<v_end)) AS due
  FROM public.user_card_status s JOIN entries e ON e.id=s.entry_id
  WHERE s.user_id=principal GROUP BY s.entry_id
 ), members AS (
  SELECT 'all'::text AS kind,NULL::uuid AS id,NULL::text AS list_type,e.id AS entry_id FROM entries e
  UNION ALL SELECT 'dictionary',e.dictionary_id,NULL,e.id FROM entries e WHERE e.dictionary_id IS NOT NULL
  UNION ALL SELECT DISTINCT 'collection',li.list_id,'curated',li.word_id
   FROM public.word_list_items li JOIN entries e ON e.id=li.word_id
   WHERE private.curated_collection_in_catalog_v1(principal, li.list_id)
  UNION ALL SELECT DISTINCT 'collection',li.list_id,'user',li.word_id
   FROM public.user_word_list_items li JOIN public.user_word_lists l ON l.id=li.list_id AND l.user_id=principal
   JOIN entries e ON e.id=li.word_id
 ), totals AS (
  SELECT m.kind,m.id,m.list_type,count(*)::integer AS total,
   (count(*) FILTER (WHERE c.started))::integer AS started,COALESCE(sum(c.due),0)::integer AS due
  FROM members m LEFT JOIN card_state c ON c.entry_id=m.entry_id GROUP BY m.kind,m.id,m.list_type
 ), named AS (
  SELECT t.*,COALESCE(r.name,cl.name,ul.name) AS name,r.kind AS dictionary_kind,
   CASE t.kind WHEN 'all' THEN 0 WHEN 'dictionary' THEN 1 ELSE 2 END AS rank,cl.sort_order
  FROM totals t
  LEFT JOIN readable r ON t.kind='dictionary' AND r.id=t.id
  LEFT JOIN public.word_lists cl ON t.kind='collection' AND t.list_type='curated' AND cl.id=t.id
  LEFT JOIN public.user_word_lists ul ON t.kind='collection' AND t.list_type='user' AND ul.id=t.id AND ul.user_id=principal
 )
 SELECT COALESCE(jsonb_agg(jsonb_strip_nulls(jsonb_build_object('kind',n.kind,'id',n.id,'listType',n.list_type,
   'name',n.name,'personal',CASE WHEN n.kind='dictionary' THEN n.dictionary_kind='user' WHEN n.kind='collection' THEN n.list_type='user' END,
   'total',n.total,'started',n.started,'due',n.due))
   ORDER BY n.rank,n.list_type NULLS FIRST,n.sort_order NULLS LAST,lower(n.name),n.id),'[]'::jsonb)
 INTO v_materials FROM (SELECT * FROM named WHERE kind='all' OR name IS NOT NULL
  ORDER BY rank,list_type NULLS FIRST,sort_order NULLS LAST,lower(name),id LIMIT 201) n;
 IF NOT v_materials @> '[{"kind":"all"}]'::jsonb THEN
  v_materials := jsonb_build_array(jsonb_build_object('kind','all','total',0,'started',0,'due',0))||v_materials;
 END IF;
 RETURN jsonb_build_object('languageCode',p_language_code,'materials',v_materials);
END;
$_$;
CREATE OR REPLACE FUNCTION public.get_word_list_summary(p_user_id uuid, p_list_id uuid, p_list_type text) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'private', 'pg_temp'
    AS $$
DECLARE original jsonb;
BEGIN
 IF (select auth.uid()) IS NULL OR p_user_id IS DISTINCT FROM (select auth.uid()) THEN
  RAISE EXCEPTION 'unauthorized: user_id does not match authenticated user'; END IF;
 IF p_list_type = 'curated' AND (
   NOT private.curated_collection_in_catalog_v1(p_user_id,p_list_id)
   OR NOT EXISTS (SELECT 1 FROM public.word_list_items item
     JOIN private.active_word_entries entry ON entry.id=item.word_id
     WHERE item.list_id=p_list_id AND (entry.dictionary_id IS NULL
       OR public.can_browse_dictionary(p_user_id,entry.dictionary_id)))
 ) THEN RETURN NULL; END IF;
 original:=private.get_word_list_summary_owner_base_v1(p_user_id,p_list_id,p_list_type);
 IF original IS NOT NULL OR p_list_type IS DISTINCT FROM 'user' THEN RETURN original; END IF;
 RETURN (
  SELECT jsonb_build_object('id',list.id,'name',list.name,'language_code',list.language_code,
   'primary_language_code',list.primary_language_code,'created_at',list.created_at,
   'ownership','received','editable',false,'is_mixed_language',counts.language_count>1,
   'user_word_list_items',jsonb_build_array(jsonb_build_object('count',counts.item_count,
    'available_count',counts.item_count,'unavailable_source_count',0)))
  FROM public.user_word_lists list
  CROSS JOIN LATERAL (
   SELECT count(*)::integer AS item_count,count(DISTINCT entry.language_code)::integer AS language_count
   FROM public.user_word_list_items item JOIN private.active_word_entries entry ON entry.id=item.word_id
   WHERE item.list_id=list.id AND private.entry_access_v1(p_user_id,entry.id,'train')
  ) counts
  WHERE list.id=p_list_id AND list.user_id<>p_user_id AND EXISTS(
   SELECT 1 FROM private.live_collection_access_paths_v1 scope
   WHERE scope.user_id=p_user_id AND scope.collection_id=list.id)
 );
END;
$$;
-- Training-only projection. Readable catalog remains independent of preferences.
CREATE FUNCTION public.get_enabled_curated_training_list_ids_v1(p_language_code text)
RETURNS TABLE(id uuid) LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO pg_catalog, public, private, pg_temp AS $$
DECLARE principal uuid := auth.uid(); disabled jsonb;
BEGIN
 IF principal IS NULL THEN RAISE EXCEPTION 'unauthorized' USING ERRCODE='42501'; END IF;
 SELECT COALESCE(material_preferences->'disabledDictionaryIds','[]'::jsonb)
  INTO disabled FROM public.user_settings WHERE user_id=principal;
 disabled:=COALESCE(disabled,'[]'::jsonb);
 RETURN QUERY SELECT l.id FROM public.word_lists l
 WHERE l.language_code=p_language_code
   AND private.curated_collection_in_catalog_v1(principal,l.id)
   AND EXISTS (SELECT 1 FROM public.word_list_items item
     JOIN private.active_word_entries entry ON entry.id=item.word_id
     WHERE item.list_id=l.id AND (entry.dictionary_id IS NULL OR
       (NOT (disabled ? entry.dictionary_id::text)
        AND public.can_browse_dictionary(principal,entry.dictionary_id))));
END;
$$;
REVOKE ALL ON FUNCTION public.get_enabled_curated_training_list_ids_v1(text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_enabled_curated_training_list_ids_v1(text) TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
