-- First-party Library POS/article filtering before tiers, grouping and pagination.
BEGIN;
CREATE OR REPLACE FUNCTION private.library_entry_matches_filters_v1(
  p_part text, p_gender text, p_selection jsonb
) RETURNS boolean LANGUAGE sql IMMUTABLE PARALLEL SAFE
SET search_path = pg_catalog,pg_temp AS $$
  WITH normalized AS (
    SELECT CASE lower(trim(COALESCE(p_part,'')))
      WHEN 'zn' THEN 'noun' WHEN 'ww' THEN 'verb' WHEN 'bn' THEN 'adjective'
      WHEN 'bw' THEN 'adverb' WHEN 'vnw' THEN 'pronoun' WHEN 'vz' THEN 'preposition'
      WHEN 'vw' THEN 'conjunction' WHEN 'tw' THEN 'numeral' WHEN 'lidw' THEN 'article'
      WHEN 'tsw' THEN 'interjection' ELSE lower(trim(COALESCE(p_part,''))) END AS part
  )
  SELECT (p_selection->'parts'='[]'::jsonb OR (p_selection->'parts') ? part)
    AND (p_selection->>'article' IS NULL OR part<>'noun'
      OR (p_selection->>'article')=ANY(regexp_split_to_array(lower(trim(COALESCE(p_gender,''))), '\s*[/,]\s*')))
  FROM normalized;
$$;
REVOKE ALL ON FUNCTION private.library_entry_matches_filters_v1(text,text,jsonb) FROM PUBLIC,anon,authenticated,service_role;

DO $clone$
DECLARE
 definition text := pg_get_functiondef('private.lookup_platform_v2_library_entries_base_v1(uuid,boolean,text,text,text,integer,integer,jsonb)'::regprocedure);
 before_text text;
 after_text text;
BEGIN
 definition := replace(definition,'FUNCTION private.lookup_platform_v2_library_entries_base_v1(',
   'FUNCTION private.lookup_platform_v2_library_filtered_entries_base_v1(');
 -- Four indexed branches. Entry primary-key joins resolve gender without broad scans.
 before_text := E'ON dictionary.id = document.dictionary_id\n        WHERE';
 IF (length(definition)-length(replace(definition,before_text,'')))/length(before_text)<>4 THEN
   RAISE EXCEPTION 'Library indexed filter anchors changed'; END IF;
 after_text := E'ON dictionary.id = document.dictionary_id\n        JOIN public.word_entries AS filter_entry ON filter_entry.id=document.entry_id\n        WHERE private.library_entry_matches_filters_v1(filter_entry.part_of_speech,filter_entry.gender,p_library_selection) AND';
 definition := replace(definition,before_text,after_text);
 -- Personal entries without an index retain their existing fallback and ACL.
 before_text := E'ON document.entry_id = entry.id\n        WHERE NOT p_catalog';
 IF (length(definition)-length(replace(definition,before_text,'')))/length(before_text)<>2 THEN
   RAISE EXCEPTION 'Library legacy filter anchors changed'; END IF;
 after_text := E'ON document.entry_id = entry.id\n        WHERE private.library_entry_matches_filters_v1(entry.part_of_speech,entry.gender,p_library_selection) AND NOT p_catalog';
 definition := replace(definition,before_text,after_text);
 -- Count whole matching articles, not the current page or the article's full sense list.
 before_text := 'v_oversized_group jsonb;';
 IF strpos(definition,before_text)=0 THEN RAISE EXCEPTION 'Library count declaration anchor changed'; END IF;
 definition := replace(definition,before_text,'v_total_groups integer; v_oversized_group jsonb;');
 before_text := E'v_oversized_group;\n\n    IF';
 IF strpos(definition,before_text)=0 THEN RAISE EXCEPTION 'Library count target anchor changed'; END IF;
 definition := replace(definition,before_text,E'v_oversized_group,v_total_groups;\n\n    IF');
 before_text := E'FROM oversized_groups\n        )\n    INTO';
 IF strpos(definition,before_text)=0 THEN RAISE EXCEPTION 'Library count select anchor changed'; END IF;
 definition := replace(definition,before_text,E'FROM oversized_groups\n        ), (SELECT count(*)::integer FROM candidate_groups)\n    INTO');
 before_text := $anchor$'selectedTierComplete', NOT COALESCE(v_has_more, false),$anchor$;
 IF strpos(definition,before_text)=0 THEN RAISE EXCEPTION 'Library count page anchor changed'; END IF;
 definition := replace(definition,before_text,$replacement$'totalGroups', v_total_groups,
            'selectedTierComplete', NOT COALESCE(v_has_more, false),$replacement$);
 EXECUTE definition;
END;
$clone$;
REVOKE ALL ON FUNCTION private.lookup_platform_v2_library_filtered_entries_base_v1(uuid,boolean,text,text,text,integer,integer,jsonb) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.lookup_platform_v2_library_filtered_entries(
  p_user_id uuid, p_query text, p_language_code text DEFAULT NULL,
  p_dictionary_ids uuid[] DEFAULT NULL, p_cursor text DEFAULT NULL,
  p_group_limit integer DEFAULT 10, p_group_entry_bound integer DEFAULT 50, p_filters jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog,public,private,pg_temp
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
  IF jsonb_array_length(parts)>10 OR EXISTS(SELECT 1 FROM jsonb_array_elements(parts) item
    WHERE jsonb_typeof(item)<>'string' OR item #>> '{}' NOT IN
      ('noun','verb','adjective','adverb','pronoun','preposition','conjunction','numeral','article','interjection')) THEN
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
REVOKE ALL ON FUNCTION public.lookup_platform_v2_library_filtered_entries(uuid,text,text,uuid[],text,integer,integer,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.lookup_platform_v2_library_filtered_entries(uuid,text,text,uuid[],text,integer,integer,jsonb) TO service_role;
COMMIT;
