BEGIN;
-- Add the existing afk/vv dictionary labels to Library filtering.
-- Retain all source, account and material access predicates.

CREATE OR REPLACE FUNCTION private.library_entry_matches_filters_v1(p_part text, p_gender text, p_selection jsonb) RETURNS boolean
    LANGUAGE sql IMMUTABLE PARALLEL SAFE
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
  WITH normalized AS (
    SELECT CASE lower(trim(COALESCE(p_part,'')))
      WHEN 'zn' THEN 'noun' WHEN 'ww' THEN 'verb' WHEN 'bn' THEN 'adjective'
      WHEN 'bw' THEN 'adverb' WHEN 'vnw' THEN 'pronoun' WHEN 'vz' THEN 'preposition'
      WHEN 'vw' THEN 'conjunction' WHEN 'tw' THEN 'numeral' WHEN 'lidw' THEN 'article'
      WHEN 'tsw' THEN 'interjection' WHEN 'afk' THEN 'abbreviation' WHEN 'vv' THEN 'prefix' ELSE lower(trim(COALESCE(p_part,''))) END AS part
  )
  SELECT (p_selection->'parts'='[]'::jsonb OR (p_selection->'parts') ? part)
    AND (p_selection->>'article' IS NULL OR part<>'noun'
      OR (p_selection->>'article')=ANY(regexp_split_to_array(lower(trim(COALESCE(p_gender,''))), '\s*[/,]\s*')))
  FROM normalized;
$$;

CREATE OR REPLACE FUNCTION public.fetch_library_collection_entries(p_list_id uuid, p_list_type text, p_filters jsonb, p_query text DEFAULT NULL::text, p_language_code text DEFAULT NULL::text, p_page integer DEFAULT 1, p_page_size integer DEFAULT 20) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
DECLARE
  principal uuid := (select auth.uid());
  parts jsonb;
  selection jsonb;
  article text;
  maximum integer;
  page_offset bigint;
  page_limit integer;
  payload jsonb;
BEGIN
  IF principal IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501'; END IF;
  IF p_list_id IS NULL OR p_list_type IS NULL OR p_list_type NOT IN ('user','curated')
     OR p_page IS NULL OR p_page < 1 OR p_page_size IS NULL OR p_page_size NOT BETWEEN 1 AND 100
     OR (p_language_code IS NOT NULL AND (length(p_language_code) NOT BETWEEN 2 AND 16))
     OR length(COALESCE(p_query,'')) > 1000 THEN
    RAISE EXCEPTION 'invalid_collection_scope' USING ERRCODE = '22023';
  END IF;
  IF p_filters IS NULL OR jsonb_typeof(p_filters) <> 'object' THEN
    RAISE EXCEPTION 'invalid_library_filters' USING ERRCODE = '22023';
  END IF;
  IF EXISTS(SELECT 1 FROM jsonb_object_keys(p_filters) k WHERE k NOT IN ('parts','article')) THEN
    RAISE EXCEPTION 'invalid_library_filters' USING ERRCODE = '22023';
  END IF;
  parts := COALESCE(p_filters->'parts','[]'::jsonb);
  IF jsonb_typeof(parts) <> 'array' THEN
    RAISE EXCEPTION 'invalid_library_filters' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(parts) > 12 OR EXISTS (
    SELECT 1 FROM jsonb_array_elements(parts) x WHERE jsonb_typeof(x) <> 'string'
    OR x #>> '{}' NOT IN ('noun','verb','adjective','adverb','pronoun','preposition','conjunction','numeral','article','interjection','abbreviation','prefix')
  ) THEN RAISE EXCEPTION 'invalid_library_filters' USING ERRCODE = '22023'; END IF;
  article := p_filters->>'article';
  IF article IS NOT NULL AND (article NOT IN ('de','het') OR NOT (parts ? 'noun')) THEN
    RAISE EXCEPTION 'invalid_library_filters' USING ERRCODE = '22023';
  END IF;
  selection := jsonb_build_object('parts',parts,'article',article);
  maximum := CASE WHEN public.get_user_tier(principal) IN ('premium','admin') THEN NULL ELSE 100 END;
  page_offset := (p_page::bigint - 1) * p_page_size;
  page_limit := GREATEST(0,LEAST(p_page_size,COALESCE(maximum::bigint-page_offset,p_page_size)))::integer;

  -- Resolve membership and ownership once; no client-supplied principal and no
  -- filtering of a previously paginated result. Both count and items use scoped.
  WITH members AS MATERIALIZED (
    SELECT li.word_id, COALESCE(li.rank,999999) AS sort_rank, NULL::timestamptz AS added_at
    FROM public.word_list_items li
    WHERE p_list_type='curated' AND li.list_id=p_list_id
    UNION ALL
    SELECT li.word_id, 0 AS sort_rank, li.added_at
    FROM public.user_word_list_items li
    JOIN public.user_word_lists list ON list.id=li.list_id AND list.user_id=principal
    WHERE p_list_type='user' AND li.list_id=p_list_id
  ), scoped AS MATERIALIZED (
    SELECT w.id,w.dictionary_id,w.language_code,w.headword,w.part_of_speech,w.gender,w.raw,w.is_nt2_2000,
           members.sort_rank,members.added_at
    FROM members JOIN private.active_word_entries w ON w.id=members.word_id
    WHERE (w.dictionary_id IS NULL OR public.can_browse_dictionary(principal,w.dictionary_id))
      AND (p_language_code IS NULL OR w.language_code=p_language_code)
      AND (NULLIF(trim(p_query),'') IS NULL OR w.headword ILIKE '%' || trim(p_query) || '%')
      AND private.library_entry_matches_filters_v1(w.part_of_speech,w.gender,selection)
  ), page AS (
    SELECT * FROM scoped
    ORDER BY sort_rank ASC,added_at DESC NULLS LAST,headword ASC,id ASC
    OFFSET page_offset LIMIT page_limit
  )
  SELECT jsonb_build_object(
    'items',COALESCE((SELECT jsonb_agg(to_jsonb(page) ORDER BY sort_rank ASC,added_at DESC NULLS LAST,headword ASC,id ASC) FROM page),'[]'::jsonb),
    'total',(SELECT count(*) FROM scoped),
    'is_locked',maximum IS NOT NULL AND page_offset>=maximum,
    'max_allowed',maximum
  ) INTO payload;
  RETURN payload;
END;
$$;

CREATE OR REPLACE FUNCTION public.lookup_platform_v2_library_filtered_entries(p_user_id uuid, p_query text, p_language_code text DEFAULT NULL::text, p_dictionary_ids uuid[] DEFAULT NULL::uuid[], p_cursor text DEFAULT NULL::text, p_group_limit integer DEFAULT 10, p_group_entry_bound integer DEFAULT 50, p_filters jsonb DEFAULT '{}'::jsonb) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'private', 'pg_temp'
    AS $$
DECLARE
  preferences jsonb;
  allowed_codes jsonb;
  selection jsonb;
  dictionary_ids jsonb;
  payload jsonb;
  parts jsonb;
  article text;
BEGIN
  IF p_user_id IS NULL THEN RETURN jsonb_build_object('error','invalid_principal'); END IF;
  IF cardinality(p_dictionary_ids)>100 OR array_position(p_dictionary_ids,NULL) IS NOT NULL THEN
    RETURN jsonb_build_object('error','invalid_dictionary_scope');
  END IF;
  IF p_filters IS NULL OR jsonb_typeof(p_filters)<>'object'
    OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_filters) key WHERE key NOT IN ('parts','article')) THEN
    RETURN jsonb_build_object('error','invalid_library_filters');
  END IF;
  parts := COALESCE(p_filters->'parts','[]'::jsonb);
  IF jsonb_typeof(parts)<>'array' THEN RETURN jsonb_build_object('error','invalid_library_filters'); END IF;
  IF jsonb_array_length(parts)>12 OR EXISTS(SELECT 1 FROM jsonb_array_elements(parts) item
    WHERE jsonb_typeof(item)<>'string' OR item #>> '{}' NOT IN
      ('noun','verb','adjective','adverb','pronoun','preposition','conjunction','numeral','article','interjection','abbreviation','prefix')) THEN
    RETURN jsonb_build_object('error','invalid_library_filters');
  END IF;
  IF p_filters ? 'article' AND p_filters->'article'<>'null'::jsonb AND
    (jsonb_typeof(p_filters->'article')<>'string' OR p_filters->>'article' NOT IN ('de','het')) THEN
    RETURN jsonb_build_object('error','invalid_library_filters');
  END IF;
  article := p_filters->>'article';
  IF article IS NOT NULL AND NOT (parts ? 'noun') THEN
    RETURN jsonb_build_object('error','invalid_library_filters');
  END IF;
  SELECT COALESCE(jsonb_agg(part ORDER BY part),'[]'::jsonb) INTO parts
    FROM (SELECT DISTINCT value AS part FROM jsonb_array_elements_text(parts)) canonical;
  SELECT material_preferences INTO preferences FROM public.user_settings WHERE user_id=p_user_id;
  preferences := COALESCE(preferences,'{"schemaVersion":1,"learningLanguages":[],"disabledDictionaryIds":[]}'::jsonb);
  IF jsonb_array_length(preferences->'learningLanguages')=0 THEN
    allowed_codes := 'null'::jsonb;
  ELSE
    SELECT COALESCE(jsonb_agg(item->>'code' ORDER BY item->>'code'),'[]'::jsonb)
      INTO allowed_codes FROM jsonb_array_elements(preferences->'learningLanguages') item
      WHERE item->'paused'='false'::jsonb;
  END IF;
  IF p_dictionary_ids IS NULL THEN dictionary_ids := 'null'::jsonb;
  ELSE
    SELECT COALESCE(jsonb_agg(id ORDER BY id),'[]'::jsonb) INTO dictionary_ids
      FROM (SELECT DISTINCT unnest(p_dictionary_ids) id) canonical;
  END IF;
  selection := jsonb_build_object('materialSelection',jsonb_build_object(
    'schemaVersion',1,'allowedLanguageCodes',allowed_codes,
    'disabledDictionaryIds',COALESCE(preferences->'disabledDictionaryIds','[]'::jsonb)),
    'dictionaryIds',dictionary_ids,'parts',parts,'article',article);
  payload := private.lookup_platform_v2_library_filtered_entries_base_v1(
    p_user_id,false,p_query,p_language_code,p_cursor,p_group_limit,p_group_entry_bound,selection);
  RETURN private.attach_platform_v2_presentation_identity_v1(payload,p_user_id,false);
END;
$$;

CREATE OR REPLACE FUNCTION public.lookup_platform_v2_library_material_entries(p_user_id uuid, p_query text, p_language_code text DEFAULT NULL::text, p_dictionary_ids uuid[] DEFAULT NULL::uuid[], p_cursor text DEFAULT NULL::text, p_group_limit integer DEFAULT 10, p_group_entry_bound integer DEFAULT 50, p_filters jsonb DEFAULT '{}'::jsonb, p_material jsonb DEFAULT NULL::jsonb) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'private', 'pg_temp'
    AS $_$
DECLARE
  preferences jsonb;
  allowed_codes jsonb;
  selection jsonb;
  dictionary_ids jsonb;
  payload jsonb;
  parts jsonb;
  article text;
BEGIN
  
  IF p_material IS NULL OR jsonb_typeof(p_material)<>'object' THEN
    RETURN jsonb_build_object('error','invalid_material_scope');
  END IF;
  IF p_material->>'kind' IS NULL OR p_material->>'kind' NOT IN ('collection','label')
    OR p_material->>'id' IS NULL OR p_material->>'id' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_material) key WHERE key NOT IN ('kind','id','collectionType'))
    OR (p_material->>'kind'='label' AND p_material ? 'collectionType')
    OR (p_material->>'kind'='collection' AND (p_material->>'collectionType' IS NULL OR p_material->>'collectionType' NOT IN ('user','curated')))
    OR p_dictionary_ids IS NOT NULL THEN
    RETURN jsonb_build_object('error','invalid_material_scope');
  END IF;
  IF NOT (
    (p_material->>'kind'='label' AND EXISTS(SELECT 1 FROM private.collection_labels WHERE user_id=p_user_id AND id=(p_material->>'id')::uuid))
    OR (p_material->>'kind'='collection' AND p_material->>'collectionType'='user' AND (EXISTS(SELECT 1 FROM public.user_word_lists WHERE user_id=p_user_id AND id=(p_material->>'id')::uuid)
    OR EXISTS(SELECT 1 FROM private.shared_collection_ids_v1(p_user_id) shared WHERE shared.collection_id=(p_material->>'id')::uuid)))
    OR (p_material->>'kind'='collection' AND p_material->>'collectionType'='curated' AND EXISTS(SELECT 1 FROM public.word_lists WHERE id=(p_material->>'id')::uuid))
  ) THEN RETURN jsonb_build_object('error','material_not_accessible'); END IF;
  IF p_user_id IS NULL THEN RETURN jsonb_build_object('error','invalid_principal'); END IF;
  IF cardinality(p_dictionary_ids)>100 OR array_position(p_dictionary_ids,NULL) IS NOT NULL THEN
    RETURN jsonb_build_object('error','invalid_dictionary_scope');
  END IF;
  IF p_filters IS NULL OR jsonb_typeof(p_filters)<>'object'
    OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_filters) key WHERE key NOT IN ('parts','article')) THEN
    RETURN jsonb_build_object('error','invalid_library_filters');
  END IF;
  parts := COALESCE(p_filters->'parts','[]'::jsonb);
  IF jsonb_typeof(parts)<>'array' THEN RETURN jsonb_build_object('error','invalid_library_filters'); END IF;
  IF jsonb_array_length(parts)>12 OR EXISTS(SELECT 1 FROM jsonb_array_elements(parts) item
    WHERE jsonb_typeof(item)<>'string' OR item #>> '{}' NOT IN
      ('noun','verb','adjective','adverb','pronoun','preposition','conjunction','numeral','article','interjection','abbreviation','prefix')) THEN
    RETURN jsonb_build_object('error','invalid_library_filters');
  END IF;
  IF p_filters ? 'article' AND p_filters->'article'<>'null'::jsonb AND
    (jsonb_typeof(p_filters->'article')<>'string' OR p_filters->>'article' NOT IN ('de','het')) THEN
    RETURN jsonb_build_object('error','invalid_library_filters');
  END IF;
  article := p_filters->>'article';
  IF article IS NOT NULL AND NOT (parts ? 'noun') THEN
    RETURN jsonb_build_object('error','invalid_library_filters');
  END IF;
  SELECT COALESCE(jsonb_agg(part ORDER BY part),'[]'::jsonb) INTO parts
    FROM (SELECT DISTINCT value AS part FROM jsonb_array_elements_text(parts)) canonical;
  SELECT material_preferences INTO preferences FROM public.user_settings WHERE user_id=p_user_id;
  preferences := COALESCE(preferences,'{"schemaVersion":1,"learningLanguages":[],"disabledDictionaryIds":[]}'::jsonb);
  IF jsonb_array_length(preferences->'learningLanguages')=0 THEN
    allowed_codes := 'null'::jsonb;
  ELSE
    SELECT COALESCE(jsonb_agg(item->>'code' ORDER BY item->>'code'),'[]'::jsonb)
      INTO allowed_codes FROM jsonb_array_elements(preferences->'learningLanguages') item
      WHERE item->'paused'='false'::jsonb;
  END IF;
  IF p_dictionary_ids IS NULL THEN dictionary_ids := 'null'::jsonb;
  ELSE
    SELECT COALESCE(jsonb_agg(id ORDER BY id),'[]'::jsonb) INTO dictionary_ids
      FROM (SELECT DISTINCT unnest(p_dictionary_ids) id) canonical;
  END IF;
  selection := jsonb_build_object('materialSelection',jsonb_build_object(
    'schemaVersion',1,'allowedLanguageCodes',allowed_codes,
    'disabledDictionaryIds',COALESCE(preferences->'disabledDictionaryIds','[]'::jsonb)),
    'dictionaryIds',dictionary_ids,'parts',parts,'article',article,'material',p_material);
  
  -- Bind cursors to the exact live membership set; additions/removals cannot silently skip pages.
  selection := selection || jsonb_build_object('materialRevision', (
    SELECT md5(COALESCE(string_agg(entry_id::text,',' ORDER BY entry_id),''))
    FROM private.library_material_entry_ids_v1(p_user_id,p_material)
  ));
  payload := private.lookup_platform_v2_library_material_filtered_entries_base_v1(
    p_user_id,false,p_query,p_language_code,p_cursor,p_group_limit,p_group_entry_bound,selection);
  
  IF NOT (payload ? 'error') THEN
    payload := jsonb_set(payload,'{page,unavailableEntryCount}', to_jsonb((
      SELECT count(*)::integer FROM private.library_material_entry_ids_v1(p_user_id,p_material) member
      JOIN public.word_entries entry ON entry.id=member.entry_id
      WHERE (p_language_code IS NULL OR entry.language_code=p_language_code)
        AND entry.id NOT IN (SELECT entry_id FROM private.readable_material_entry_ids_v1(p_user_id,p_material))
    )),true);
  END IF;
  RETURN private.attach_platform_v2_presentation_identity_v1(payload,p_user_id,false);
END;
$_$;

CREATE OR REPLACE FUNCTION public.search_library_category_v1(
  p_user_id uuid,p_query text,p_language_code text DEFAULT NULL,p_dictionary_ids uuid[] DEFAULT NULL,
  p_filters jsonb DEFAULT '{}'::jsonb,p_material jsonb DEFAULT NULL,p_group text DEFAULT 'headwords',
  p_limit integer DEFAULT 100,p_cursor text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog','public','private','pg_temp' AS $_$
DECLARE
  preferences jsonb; allowed_codes jsonb; selection jsonb; dictionary_ids jsonb;
  payload jsonb; parts jsonb; article text; outer_cursor jsonb; inner_cursor text;
  scope_key text; unavailable_count integer := 0;
BEGIN
  IF p_user_id IS NULL THEN RETURN jsonb_build_object('error','invalid_principal'); END IF;
  IF NULLIF(btrim(p_query),'') IS NULL OR length(p_query)>200 THEN RETURN jsonb_build_object('error','invalid_query'); END IF;
  IF p_group IS NULL OR p_group NOT IN ('headwords','examples','definitions','alphabetical') THEN RETURN jsonb_build_object('error','invalid_search_group'); END IF;
  IF NOT private.dictionary_search_index_ready_v1() THEN RETURN jsonb_build_object('error','search_index_not_ready'); END IF;
  IF p_material IS NOT NULL AND jsonb_typeof(p_material)<>'object' THEN
    RETURN jsonb_build_object('error','invalid_material_scope');
  END IF;
  IF p_material IS NOT NULL THEN
  IF p_material->>'kind' IS NULL OR p_material->>'kind' NOT IN ('collection','label')
    OR p_material->>'id' IS NULL OR p_material->>'id' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_material) key WHERE key NOT IN ('kind','id','collectionType'))
    OR (p_material->>'kind'='label' AND p_material ? 'collectionType')
    OR (p_material->>'kind'='collection' AND (p_material->>'collectionType' IS NULL OR p_material->>'collectionType' NOT IN ('user','curated')))
    OR p_dictionary_ids IS NOT NULL THEN
    RETURN jsonb_build_object('error','invalid_material_scope');
  END IF;
  IF NOT (
    (p_material->>'kind'='label' AND EXISTS(SELECT 1 FROM private.collection_labels WHERE user_id=p_user_id AND id=(p_material->>'id')::uuid))
    OR (p_material->>'kind'='collection' AND p_material->>'collectionType'='user' AND (EXISTS(SELECT 1 FROM public.user_word_lists WHERE user_id=p_user_id AND id=(p_material->>'id')::uuid)
    OR EXISTS(SELECT 1 FROM private.shared_collection_ids_v1(p_user_id) shared WHERE shared.collection_id=(p_material->>'id')::uuid)))
    OR (p_material->>'kind'='collection' AND p_material->>'collectionType'='curated' AND EXISTS(SELECT 1 FROM public.word_lists WHERE id=(p_material->>'id')::uuid))
  ) THEN RETURN jsonb_build_object('error','material_not_accessible'); END IF;
  END IF;
  IF p_user_id IS NULL THEN RETURN jsonb_build_object('error','invalid_principal'); END IF;
  IF cardinality(p_dictionary_ids)>100 OR array_position(p_dictionary_ids,NULL) IS NOT NULL THEN
    RETURN jsonb_build_object('error','invalid_dictionary_scope');
  END IF;
  IF p_filters IS NULL OR jsonb_typeof(p_filters)<>'object'
    OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_filters) key WHERE key NOT IN ('parts','article')) THEN
    RETURN jsonb_build_object('error','invalid_library_filters');
  END IF;
  parts := COALESCE(p_filters->'parts','[]'::jsonb);
  IF jsonb_typeof(parts)<>'array' THEN RETURN jsonb_build_object('error','invalid_library_filters'); END IF;
  IF jsonb_array_length(parts)>12 OR EXISTS(SELECT 1 FROM jsonb_array_elements(parts) item
    WHERE jsonb_typeof(item)<>'string' OR item #>> '{}' NOT IN
      ('noun','verb','adjective','adverb','pronoun','preposition','conjunction','numeral','article','interjection','abbreviation','prefix')) THEN
    RETURN jsonb_build_object('error','invalid_library_filters');
  END IF;
  IF p_filters ? 'article' AND p_filters->'article'<>'null'::jsonb AND
    (jsonb_typeof(p_filters->'article')<>'string' OR p_filters->>'article' NOT IN ('de','het')) THEN
    RETURN jsonb_build_object('error','invalid_library_filters');
  END IF;
  article := p_filters->>'article';
  IF article IS NOT NULL AND NOT (parts ? 'noun') THEN
    RETURN jsonb_build_object('error','invalid_library_filters');
  END IF;
  SELECT COALESCE(jsonb_agg(part ORDER BY part),'[]'::jsonb) INTO parts
    FROM (SELECT DISTINCT value AS part FROM jsonb_array_elements_text(parts)) canonical;
  SELECT material_preferences INTO preferences FROM public.user_settings WHERE user_id=p_user_id;
  preferences := COALESCE(preferences,'{"schemaVersion":1,"learningLanguages":[],"disabledDictionaryIds":[]}'::jsonb);
  IF jsonb_array_length(preferences->'learningLanguages')=0 THEN
    allowed_codes := 'null'::jsonb;
  ELSE
    SELECT COALESCE(jsonb_agg(item->>'code' ORDER BY item->>'code'),'[]'::jsonb)
      INTO allowed_codes FROM jsonb_array_elements(preferences->'learningLanguages') item
      WHERE item->'paused'='false'::jsonb;
  END IF;
  IF p_dictionary_ids IS NULL THEN dictionary_ids := 'null'::jsonb;
  ELSE
    SELECT COALESCE(jsonb_agg(id ORDER BY id),'[]'::jsonb) INTO dictionary_ids
      FROM (SELECT DISTINCT unnest(p_dictionary_ids) id) canonical;
  END IF;
  selection := jsonb_build_object('materialSelection',jsonb_build_object(
    'schemaVersion',1,'allowedLanguageCodes',allowed_codes,
    'disabledDictionaryIds',COALESCE(preferences->'disabledDictionaryIds','[]'::jsonb)),
    'dictionaryIds',dictionary_ids,'parts',parts,'article',article) || CASE WHEN p_material IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('material',p_material) END;
  
  -- Bind cursors to the exact live membership set; additions/removals cannot silently skip pages.
  IF p_material IS NOT NULL THEN
  selection := selection || jsonb_build_object('materialRevision', (
    SELECT md5(COALESCE(string_agg(entry_id::text,',' ORDER BY entry_id),''))
    FROM private.library_material_entry_ids_v1(p_user_id,p_material)
  ));
  END IF;

  scope_key := md5(jsonb_build_array('library-category-v1',p_user_id,btrim(p_query),p_language_code,p_group,selection)::text);
  IF p_cursor IS NOT NULL THEN
    outer_cursor := private.decode_dictionary_search_cursor_v1(p_cursor);
    IF outer_cursor->>'scopeKey' IS DISTINCT FROM scope_key OR outer_cursor->>'inner' IS NULL THEN
      RETURN jsonb_build_object('error','invalid_cursor');
    END IF;
    inner_cursor := outer_cursor->>'inner';
  END IF;
  IF p_group='headwords' THEN
    payload := private.search_library_headwords_v1(p_user_id,false,p_query,p_language_code,p_dictionary_ids,p_limit,inner_cursor,selection);
  ELSIF p_group='alphabetical' THEN
    payload := private.search_library_alphabetical_v1(p_user_id,false,p_query,p_language_code,p_dictionary_ids,p_limit,inner_cursor,selection);
  ELSE
    payload := private.search_library_body_v1(p_user_id,false,p_query,p_language_code,p_dictionary_ids,p_group,p_limit,inner_cursor,selection);
  END IF;
  IF payload#>>'{page,nextCursor}' IS NOT NULL THEN
    payload := jsonb_set(payload,'{page,nextCursor}',to_jsonb(private.encode_dictionary_search_cursor_v1(
      jsonb_build_object('scopeKey',scope_key,'inner',payload#>>'{page,nextCursor}'))));
  END IF;
  IF p_material IS NOT NULL THEN
    SELECT count(*)::integer INTO unavailable_count
    FROM private.library_material_entry_ids_v1(p_user_id,p_material) member
    JOIN public.word_entries entry ON entry.id=member.entry_id
    WHERE (p_language_code IS NULL OR entry.language_code=p_language_code)
      AND entry.id NOT IN (SELECT entry_id FROM private.readable_material_entry_ids_v1(p_user_id,p_material));
  END IF;
  RETURN jsonb_build_object('groups',private.clean_dictionary_search_groups_v1(jsonb_build_array(payload)),'unavailableEntryCount',unavailable_count);
END;
$_$;

NOTIFY pgrst, 'reload schema';
COMMIT;
