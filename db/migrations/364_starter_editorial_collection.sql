-- Fresh installs only; operators provision the editorial collection separately.
BEGIN;
ALTER TABLE private.starter_training_config ADD COLUMN collection_id uuid REFERENCES public.word_lists(id);
CREATE OR REPLACE FUNCTION private.initialize_starter_training_v1(p_user_id uuid) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,private,pg_temp AS $$
DECLARE state private.starter_training_initializations%rowtype; settings public.user_settings%rowtype;
  dictionary public.dictionaries%rowtype; collection_id uuid; training_id text; failure text;
BEGIN
  SELECT * INTO state FROM private.starter_training_initializations WHERE user_id=p_user_id FOR UPDATE;
  IF NOT FOUND THEN RETURN 'not_applicable'; END IF;
  IF state.status <> 'pending' THEN RETURN state.status; END IF;
  SELECT * INTO settings FROM public.user_settings WHERE user_id=p_user_id FOR UPDATE;
  IF NOT FOUND THEN failure := 'settings_unavailable';
  ELSIF settings.training_setups_revision <> 0 OR jsonb_array_length(settings.training_setups->'trainings') <> 0 THEN
    UPDATE private.starter_training_initializations SET status='superseded',last_failure=NULL,updated_at=now() WHERE user_id=p_user_id;
    RETURN 'superseded';
  ELSE
    SELECT d.* INTO dictionary FROM private.starter_training_config c JOIN public.dictionaries d ON d.id=c.dictionary_id WHERE c.singleton;
    IF NOT FOUND OR dictionary.language_code <> 'nl' OR dictionary.kind <> 'curated' OR dictionary.publication_state <> 'general'
      OR COALESCE(dictionary.minimum_subscription_tier,'free') <> 'free'
      OR NOT public.can_access_dictionary(p_user_id,dictionary.id,'read') THEN
      failure := 'primary_dictionary_unavailable';
    ELSE
      SELECT c.collection_id INTO collection_id FROM private.starter_training_config c WHERE c.singleton;
      IF NOT EXISTS (SELECT 1 FROM public.word_lists l WHERE l.id=collection_id AND l.language_code='nl')
        OR NOT EXISTS (SELECT 1 FROM public.word_list_items i WHERE i.list_id=collection_id)
        OR EXISTS (SELECT 1 FROM public.word_list_items i LEFT JOIN private.active_word_entries e ON e.id=i.word_id
          WHERE i.list_id=collection_id AND (e.id IS NULL OR e.dictionary_id IS DISTINCT FROM dictionary.id)) THEN
        failure := 'starter_collection_unavailable';
      ELSIF NOT EXISTS (SELECT 1 FROM private.training_recipe_eligible_cards_v1(
        p_user_id,ARRAY['word-to-definition'],collection_id,'curated','both','auto',ARRAY[]::uuid[],ARRAY[]::text[],
        '{}'::jsonb,false,false) WHERE intrinsic_source='new') THEN
        failure := 'starter_cards_unavailable';
      END IF;
    END IF;
  END IF;
  IF failure IS NOT NULL THEN
    UPDATE private.starter_training_initializations SET last_failure=failure,updated_at=now() WHERE user_id=p_user_id;
    RETURN 'pending';
  END IF;
  training_id := gen_random_uuid()::text;
  UPDATE public.user_settings SET training_setups=jsonb_build_object('schemaVersion',1,'mainTrainingId',training_id,
    'trainings',jsonb_build_array(jsonb_build_object('id',training_id,'name','Dilum 100','languageCode','nl',
      'draft',jsonb_build_object('family','meaning','scenarioId','understanding','modes',jsonb_build_array('word-to-definition','definition-to-word'),
      'cardFilter','both','listValue','curated:'||collection_id::text,'sourceValue','all','materialMode','collection',
      'newReviewRatio',2,'dateWindow','all','sessionSize',10)))),
    training_setups_revision=training_setups_revision+1,updated_at=now() WHERE user_id=p_user_id;
  UPDATE private.starter_training_initializations SET status='complete',last_failure=NULL,updated_at=now() WHERE user_id=p_user_id;
  RETURN 'complete';
END;
$$;
NOTIFY pgrst, 'reload schema';
COMMIT;
