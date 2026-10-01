-- Freeze account material selection at new-run creation. Receipts and existing
-- sessions retain their own scope; dictionary access remains independently checked.
BEGIN;
CREATE OR REPLACE FUNCTION private.training_material_entry_selected_v1(
  p_language_code text, p_dictionary_id uuid, p_filter jsonb
) RETURNS boolean LANGUAGE sql IMMUTABLE PARALLEL SAFE
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT CASE WHEN NOT COALESCE(p_filter ? 'materialSelection', false) THEN true
    ELSE COALESCE(
      ((p_filter#>'{materialSelection,allowedLanguageCodes}') = 'null'::jsonb
        OR (p_filter#>'{materialSelection,allowedLanguageCodes}') ? p_language_code)
      AND (p_dictionary_id IS NULL OR NOT
        ((p_filter#>'{materialSelection,disabledDictionaryIds}') ? p_dictionary_id::text)), false)
    END;
$$;
REVOKE ALL ON FUNCTION private.training_material_entry_selected_v1(text,uuid,jsonb)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION private.resolve_training_material_selection_v1(
  p_user_id uuid, p_list_id uuid, p_list_type text, p_filter jsonb
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, private, pg_temp
AS $$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_preferences jsonb;
  v_language text;
  v_allowed jsonb;
  v_filter jsonb := COALESCE(p_filter, '{}'::jsonb);
BEGIN
  IF v_uid IS NULL OR p_user_id IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'unauthorized: user_id does not match authenticated user';
  END IF;
  IF jsonb_typeof(v_filter) <> 'object' THEN RAISE EXCEPTION 'invalid_training_filter'; END IF;
  SELECT settings.material_preferences, settings.language_code
    INTO v_preferences, v_language FROM public.user_settings settings
    WHERE settings.user_id = p_user_id;
  v_preferences := COALESCE(v_preferences,
    '{"schemaVersion":1,"learningLanguages":[],"disabledDictionaryIds":[]}'::jsonb);
  v_language := COALESCE(v_language, 'nl');
  IF v_filter ? 'dictionaryScope' THEN
    v_language := v_filter#>>'{dictionaryScope,languageCode}';
  ELSIF p_list_id IS NOT NULL THEN
    IF p_list_type = 'user' THEN
      SELECT COALESCE(list.primary_language_code,list.language_code,v_language)
        INTO v_language FROM public.user_word_lists list
        WHERE list.id=p_list_id AND list.user_id=p_user_id;
    ELSE
      SELECT COALESCE(list.primary_language_code,list.language_code,v_language)
        INTO v_language FROM public.word_lists list WHERE list.id=p_list_id;
    END IF;
    IF NOT FOUND THEN RAISE EXCEPTION 'training_material_unavailable'; END IF;
  END IF;
  IF jsonb_array_length(v_preferences->'learningLanguages') = 0 THEN
    v_allowed := 'null'::jsonb;
  ELSE
    SELECT COALESCE(jsonb_agg(item->>'code'), '[]'::jsonb) INTO v_allowed
      FROM jsonb_array_elements(v_preferences->'learningLanguages') item
      WHERE item->'paused' = 'false'::jsonb;
    IF NOT (v_allowed ? v_language) THEN RAISE EXCEPTION 'training_material_unavailable'; END IF;
  END IF;
  -- Caller-supplied snapshots are never authoritative for a new run or plan.
  v_filter := (v_filter - 'materialSelection') || jsonb_build_object('materialSelection',
    jsonb_build_object('schemaVersion',1,'allowedLanguageCodes',v_allowed,
      'disabledDictionaryIds',v_preferences->'disabledDictionaryIds'));
  IF v_filter ? 'dictionaryScope' AND NOT EXISTS (
    SELECT 1 FROM public.dictionaries dictionary
    WHERE dictionary.language_code=v_language
      AND public.can_access_dictionary(p_user_id,dictionary.id,'read')
      AND private.training_material_entry_selected_v1(dictionary.language_code,dictionary.id,v_filter)
      AND (v_filter#>>'{dictionaryScope,mode}' = 'all' OR
        (v_filter#>'{dictionaryScope,dictionaryIds}') ? dictionary.id::text)
  ) THEN RAISE EXCEPTION 'training_material_unavailable'; END IF;
  RETURN v_filter;
END;
$$;
REVOKE ALL ON FUNCTION private.resolve_training_material_selection_v1(uuid,uuid,text,jsonb)
  FROM PUBLIC, anon, authenticated, service_role;

-- Guard the current definitions rather than overwriting intervening scheduler,
-- source binding, pair exclusion and idempotency changes with older copies.
CREATE OR REPLACE FUNCTION pg_temp.patch_training_material_definition(
  p_signature text, p_before text, p_after text,
  p_second_before text DEFAULT NULL, p_second_after text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql AS $$
DECLARE definition text; anchors text[] := ARRAY[p_before,p_second_before];
  replacements text[] := ARRAY[p_after,p_second_after]; i integer;
BEGIN
  SELECT pg_get_functiondef(p_signature::regprocedure) INTO definition;
  FOR i IN 1..2 LOOP
    IF anchors[i] IS NULL THEN CONTINUE; END IF;
    IF strpos(definition,replacements[i])>0 THEN CONTINUE; END IF;
    IF (length(definition)-length(replace(definition,anchors[i],'')))/length(anchors[i]) <> 1 THEN
      RAISE EXCEPTION 'material-selection migration unexpected baseline: %',p_signature;
    END IF;
    definition := replace(definition,anchors[i],replacements[i]);
  END LOOP;
  -- Compile once: renaming a CTE and inserting its filtered successor must be atomic.
  EXECUTE definition;
END;
$$;

SELECT pg_temp.patch_training_material_definition(
  'private.training_scheduler_candidates_v2(uuid,text[],uuid,text,text,text,uuid[],text[],jsonb,boolean,boolean)',
$before$), scope AS MATERIALIZED ($before$,
$after$), raw_scope AS MATERIALIZED ($after$,
$before$), matched AS ($before$,
$after$), scope AS MATERIALIZED (
    SELECT raw_scope.id FROM raw_scope
    JOIN public.word_entries material_entry ON material_entry.id=raw_scope.id
    CROSS JOIN filter_values material_filter
    WHERE private.training_material_entry_selected_v1(
      material_entry.language_code,material_entry.dictionary_id,material_filter.filter_data)
  ), matched AS ($after$);

SELECT pg_temp.patch_training_material_definition(
  'private.training_extra_source_entries_v1(uuid,uuid,text,jsonb)',
$before$  WHERE (entry.dictionary_id IS NULL OR dictionary.id IS NOT NULL)$before$,
$after$  WHERE (entry.dictionary_id IS NULL OR dictionary.id IS NOT NULL)
    AND private.training_material_entry_selected_v1(entry.language_code,entry.dictionary_id,v_filter)$after$);

SELECT pg_temp.patch_training_material_definition(
  'private.start_training_session_latch_v1(uuid,text[],uuid,text,text,jsonb,text,integer)',
$before$  IF v_filter ? 'dictionaryScope' THEN$before$,
$after$  v_filter := private.resolve_training_material_selection_v1(p_user_id,p_list_id,p_list_type,v_filter);

  IF v_filter ? 'dictionaryScope' THEN$after$);

SELECT pg_temp.patch_training_material_definition(
  'public.get_training_session_plan(uuid,text[],uuid,text,text,jsonb,text,integer)',
$before$    p_card_filter, COALESCE(p_training_filter, '{}'::jsonb), v_size,$before$,
$after$    p_card_filter, private.resolve_training_material_selection_v1(p_user_id,p_list_id,p_list_type,p_training_filter), v_size,$after$);

SELECT pg_temp.patch_training_material_definition(
  'private.start_platform_v2_idiom_training_session_v2(uuid,text,text,uuid,uuid,text,text,jsonb,integer)',
$before$    INSERT INTO public.training_sessions ($before$,
$after$    v_filter := private.resolve_training_material_selection_v1(p_user_id,p_list_id,p_list_type,v_filter);

    INSERT INTO public.training_sessions ($after$);

SELECT pg_temp.patch_training_material_definition(
  'private.start_platform_v2_translation_training_session_v2(uuid,text,uuid,uuid,text,text,jsonb,integer)',
$before$    INSERT INTO public.training_sessions ($before$,
$after$    v_filter := private.resolve_training_material_selection_v1(p_user_id,p_list_id,p_list_type,v_filter);

    INSERT INTO public.training_sessions ($after$);

CREATE OR REPLACE FUNCTION pg_temp.clone_material_candidates(p_signature text,p_old_name text,p_new_name text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE definition text; anchor text := '               AND node.binding_state = ''active''';
BEGIN
  SELECT pg_get_functiondef(p_signature::regprocedure) INTO definition;
  IF (length(definition)-length(replace(definition,anchor,'')))/length(anchor) <> 1 THEN
    RAISE EXCEPTION 'material candidate migration unexpected baseline: %',p_signature;
  END IF;
  definition := replace(definition,p_old_name || '(p_user_id uuid,',
    p_new_name || '(p_material_filter jsonb, p_user_id uuid,');
  IF strpos(definition,p_new_name || '(p_material_filter jsonb,') = 0 THEN
    RAISE EXCEPTION 'material candidate migration unexpected signature: %',p_signature;
  END IF;
  definition := replace(definition,anchor,anchor || '
               AND EXISTS (SELECT 1 FROM public.word_entries material_entry
                 WHERE material_entry.id=node.entry_id
                   AND private.training_material_entry_selected_v1(
                     material_entry.language_code,material_entry.dictionary_id,p_material_filter))');
  EXECUTE definition;
END;
$$;
SELECT pg_temp.clone_material_candidates(
  'private.platform_v2_idiom_exercise_candidates_v1(uuid,text,integer,integer)',
  'private.platform_v2_idiom_exercise_candidates_v1','private.platform_v2_idiom_exercise_candidates_v1_with_material');
SELECT pg_temp.clone_material_candidates(
  'private.platform_v2_translation_exercise_candidates_v1(uuid,integer,integer)',
  'private.platform_v2_translation_exercise_candidates_v1','private.platform_v2_translation_exercise_candidates_v1_with_material');
REVOKE ALL ON FUNCTION private.platform_v2_idiom_exercise_candidates_v1_with_material(jsonb,uuid,text,integer,integer),
  private.platform_v2_translation_exercise_candidates_v1_with_material(jsonb,uuid,integer,integer)
  FROM PUBLIC,anon,authenticated,service_role;

SELECT pg_temp.patch_training_material_definition(
  'private.start_platform_v2_idiom_training_session_v1(uuid,text,text,uuid)',
$before$    v_session_id uuid := gen_random_uuid();$before$,
$after$    v_session_id uuid := gen_random_uuid();
    v_filter jsonb;$after$);

SELECT pg_temp.patch_training_material_definition(
  'private.start_platform_v2_idiom_training_session_v1(uuid,text,text,uuid)',
$before$    INSERT INTO public.training_sessions ($before$,
$after$    v_filter := private.resolve_training_material_selection_v1(p_user_id,NULL,'curated','{}'::jsonb);

    INSERT INTO public.training_sessions ($after$);

SELECT pg_temp.patch_training_material_definition(
  'private.start_platform_v2_translation_training_session_v1(uuid,text,uuid)',
$before$    v_session_id uuid := gen_random_uuid();$before$,
$after$    v_session_id uuid := gen_random_uuid();
    v_filter jsonb;$after$);

SELECT pg_temp.patch_training_material_definition(
  'private.start_platform_v2_translation_training_session_v1(uuid,text,uuid)',
$before$    INSERT INTO public.training_sessions ($before$,
$after$    v_filter := private.resolve_training_material_selection_v1(p_user_id,NULL,'curated','{}'::jsonb);

    INSERT INTO public.training_sessions ($after$);

SELECT pg_temp.patch_training_material_definition(
  'private.start_platform_v2_idiom_training_session_v1(uuid,text,text,uuid)',
$before$        '{}'::jsonb,$before$,
$after$        v_filter,$after$);

SELECT pg_temp.patch_training_material_definition(
  'private.start_platform_v2_translation_training_session_v1(uuid,text,uuid)',
$before$        'curated', 'both', '{}'::jsonb, v_requested_total, v_now$before$,
$after$        'curated', 'both', v_filter, v_requested_total, v_now$after$);

SELECT pg_temp.patch_training_material_definition(
  'private.start_platform_v2_idiom_training_session_v1(uuid,text,text,uuid)',
$before$              FROM private.platform_v2_idiom_exercise_candidates_v1(
                  p_user_id,$before$,
$after$              FROM private.platform_v2_idiom_exercise_candidates_v1_with_material(
                  v_filter, p_user_id,$after$);

SELECT pg_temp.patch_training_material_definition(
  'private.start_platform_v2_translation_training_session_v1(uuid,text,uuid)',
$before$          FROM private.platform_v2_translation_exercise_candidates_v1(
              p_user_id,$before$,
$after$          FROM private.platform_v2_translation_exercise_candidates_v1_with_material(
              v_filter, p_user_id,$after$);

COMMIT;
