BEGIN READ ONLY;
DO $material_policy$
DECLARE signature text; definition text; fn regprocedure;
BEGIN
 FOREACH signature IN ARRAY ARRAY[
  'private.resolve_training_material_selection_v1(uuid,uuid,text,jsonb)',
  'private.training_material_entry_selected_v1(text,uuid,jsonb)',
  'private.platform_v2_idiom_exercise_candidates_v1_with_material(jsonb,uuid,text,integer,integer)',
  'private.platform_v2_translation_exercise_candidates_v1_with_material(jsonb,uuid,integer,integer)'
 ] LOOP
  fn := signature::regprocedure;
  IF has_function_privilege('anon',fn,'EXECUTE') OR has_function_privilege('authenticated',fn,'EXECUTE')
    OR has_function_privilege('service_role',fn,'EXECUTE') THEN
   RAISE EXCEPTION 'db-contract-gate: material helper client grant %',signature;
  END IF;
 END LOOP;
 FOREACH signature IN ARRAY ARRAY[
  'private.start_training_session_latch_v1(uuid,text[],uuid,text,text,jsonb,text,integer)',
  'public.get_training_session_plan(uuid,text[],uuid,text,text,jsonb,text,integer)',
  'private.start_platform_v2_idiom_training_session_v1(uuid,text,text,uuid)',
  'private.start_platform_v2_translation_training_session_v1(uuid,text,uuid)',
  'private.start_platform_v2_idiom_training_session_v2(uuid,text,text,uuid,uuid,text,text,jsonb,integer)',
  'private.start_platform_v2_translation_training_session_v2(uuid,text,uuid,uuid,text,text,jsonb,integer)'
 ] LOOP
  SELECT pg_get_functiondef(signature::regprocedure) INTO definition;
  IF strpos(definition,'private.resolve_training_material_selection_v1')=0 THEN
   RAISE EXCEPTION 'db-contract-gate: missing current material boundary %',signature;
  END IF;
  IF signature LIKE '%platform_v2%training_session%' AND (
    strpos(definition,'RETURN private.training_') > strpos(definition,'v_filter := private.resolve_training_material_selection_v1')
    OR strpos(definition,'v_filter := private.resolve_training_material_selection_v1') > strpos(definition,'INSERT INTO public.training_sessions')
  ) THEN RAISE EXCEPTION 'db-contract-gate: material resolution moved across receipt/session boundary %',signature; END IF;
 END LOOP;
 FOREACH signature IN ARRAY ARRAY[
  'private.training_scheduler_candidates_v2(uuid,text[],uuid,text,text,text,uuid[],text[],jsonb,boolean,boolean)',
  'private.training_extra_source_entries_v1(uuid,uuid,text,jsonb)',
  'private.platform_v2_idiom_exercise_candidates_v1_with_material(jsonb,uuid,text,integer,integer)',
  'private.platform_v2_translation_exercise_candidates_v1_with_material(jsonb,uuid,integer,integer)'
 ] LOOP
  SELECT pg_get_functiondef(signature::regprocedure) INTO definition;
  IF strpos(definition,'private.training_material_entry_selected_v1')=0
    OR strpos(definition,'private.resolve_training_material_selection_v1')>0 THEN
   RAISE EXCEPTION 'db-contract-gate: candidate snapshot boundary changed %',signature;
  END IF;
 END LOOP;
 FOREACH signature IN ARRAY ARRAY[
  'private.training_scheduler_candidates_v2(uuid,text[],uuid,text,text,text,uuid[],text[],jsonb,boolean,boolean)',
  'private.platform_v2_idiom_exercise_candidates_v1_with_material(jsonb,uuid,text,integer,integer)',
  'private.platform_v2_translation_exercise_candidates_v1_with_material(jsonb,uuid,integer,integer)'
 ] LOOP
  SELECT pg_get_functiondef(signature::regprocedure) INTO definition;
  IF strpos(definition,'private.training_pair_exclusions')=0 THEN RAISE EXCEPTION 'db-contract-gate: pair filter lost %',signature; END IF;
 END LOOP;
 IF NOT private.training_material_entry_selected_v1('nl',NULL,'{}')
    OR NOT private.training_material_entry_selected_v1('nl',NULL,'{"materialSelection":{"allowedLanguageCodes":["nl"],"disabledDictionaryIds":[]}}')
    OR private.training_material_entry_selected_v1('en',NULL,'{"materialSelection":{"allowedLanguageCodes":["nl"],"disabledDictionaryIds":[]}}')
    OR private.training_material_entry_selected_v1('nl',NULL,'{"materialSelection":{}}') THEN
  RAISE EXCEPTION 'db-contract-gate: material matcher changed';
 END IF;
END;
$material_policy$;
COMMIT;
