-- First-party Library search scope. Existing Platform lookup/exact group reads stay unchanged.
BEGIN;
DO $clone$
DECLARE
  definition text := pg_get_functiondef('private.lookup_platform_v2_entries_base_v1(uuid,boolean,text,text,text,integer,integer)'::regprocedure);
  before_text text;
  after_text text;
BEGIN
  definition := replace(definition,
    'FUNCTION private.lookup_platform_v2_entries_base_v1(',
    'FUNCTION private.lookup_platform_v2_library_entries_base_v1(');
  before_text := 'p_group_entry_bound integer DEFAULT 50)';
  IF strpos(definition,before_text)=0 THEN RAISE EXCEPTION 'library lookup signature anchor missing'; END IF;
  definition := replace(definition,before_text,'p_group_entry_bound integer DEFAULT 50, p_library_selection jsonb DEFAULT NULL::jsonb)');
  before_text := $old$COALESCE(v_language_code, '')$old$;
  IF (length(definition)-length(replace(definition,before_text,'')))/length(before_text)<>1 THEN
    RAISE EXCEPTION 'library lookup cursor anchor changed';
  END IF;
  definition := replace(definition,before_text,$new$COALESCE(v_language_code, ''), p_library_selection::text$new$);
  before_text := E'CROSS JOIN user_context\n        WHERE (';
  IF (length(definition)-length(replace(definition,before_text,'')))/length(before_text)<>1 THEN
    RAISE EXCEPTION 'library lookup dictionary anchor changed';
  END IF;
  after_text := $new$CROSS JOIN user_context
        WHERE private.training_material_entry_selected_v1(
            dictionary.language_code,
            CASE WHEN dictionary.kind='user' THEN NULL ELSE dictionary.id END,
            p_library_selection)
          AND (p_library_selection->'dictionaryIds'='null'::jsonb
               OR (p_library_selection->'dictionaryIds') ? dictionary.id::text)
          AND ($new$;
  definition := replace(definition,before_text,after_text);
  EXECUTE definition;
END;
$clone$;
REVOKE ALL ON FUNCTION private.lookup_platform_v2_library_entries_base_v1(uuid,boolean,text,text,text,integer,integer,jsonb) FROM PUBLIC,anon,authenticated,service_role;

-- Called only by the server with its authenticated principal; never a browser-supplied user ID.
CREATE OR REPLACE FUNCTION public.lookup_platform_v2_library_entries(
  p_user_id uuid, p_query text, p_language_code text DEFAULT NULL,
  p_dictionary_ids uuid[] DEFAULT NULL, p_cursor text DEFAULT NULL,
  p_group_limit integer DEFAULT 10, p_group_entry_bound integer DEFAULT 50
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog,public,private,pg_temp
AS $$
DECLARE
  preferences jsonb;
  allowed_codes jsonb;
  selection jsonb;
  dictionary_ids jsonb;
  payload jsonb;
BEGIN
  IF p_user_id IS NULL THEN RETURN jsonb_build_object('error','invalid_principal'); END IF;
  IF cardinality(p_dictionary_ids)>100 OR array_position(p_dictionary_ids,NULL) IS NOT NULL THEN
    RETURN jsonb_build_object('error','invalid_dictionary_scope');
  END IF;
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
    'dictionaryIds',dictionary_ids);
  payload := private.lookup_platform_v2_library_entries_base_v1(
    p_user_id,false,p_query,p_language_code,p_cursor,p_group_limit,p_group_entry_bound,selection);
  RETURN private.attach_platform_v2_presentation_identity_v1(payload,p_user_id,false);
END;
$$;
REVOKE ALL ON FUNCTION public.lookup_platform_v2_library_entries(uuid,text,text,uuid[],text,integer,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.lookup_platform_v2_library_entries(uuid,text,text,uuid[],text,integer,integer) TO service_role;
COMMIT;
