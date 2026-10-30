-- Public fresh-install feature. Managed retaining upgrades are owned separately.
BEGIN;

-- NULL is an explicit opt-out/rollback for FUTURE accounts only. Installing this
-- feature never guesses dictionary identities or mutates existing learners.
CREATE TABLE private.new_learner_defaults (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  revision integer NOT NULL DEFAULT 0 CHECK (revision >= 0),
  document jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE private.new_learner_defaults ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.new_learner_defaults FROM PUBLIC, anon, authenticated, service_role;
INSERT INTO private.new_learner_defaults(singleton) VALUES(true);

CREATE TABLE private.new_learner_initializations (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  defaults_revision integer NOT NULL,
  initialized_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE private.new_learner_initializations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.new_learner_initializations FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION private.is_valid_new_learner_defaults_v1(p_document jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path TO pg_catalog, pg_temp AS $$
DECLARE item jsonb; slug jsonb; codes text[] := '{}'; slugs text[];
BEGIN
  IF p_document IS NULL THEN RETURN true; END IF;
  IF jsonb_typeof(p_document) <> 'object'
    OR p_document->'schemaVersion' IS DISTINCT FROM '1'::jsonb
    OR jsonb_typeof(p_document->'languages') IS DISTINCT FROM 'array'
    OR (p_document - ARRAY['schemaVersion','languages']) <> '{}'::jsonb
    OR octet_length(p_document::text)>65536 THEN RETURN false; END IF;
  IF jsonb_array_length(p_document->'languages') NOT BETWEEN 1 AND 100 THEN RETURN false; END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(p_document->'languages') LOOP
    IF jsonb_typeof(item)<>'object'
      OR (item - ARRAY['code','primaryDictionarySlug','disabledDictionarySlugs','trainingName'])<>'{}'::jsonb
      OR jsonb_typeof(item->'code') IS DISTINCT FROM 'string'
      OR length(item->>'code')>35 OR (item->>'code') !~ '^[a-z]{2,3}(-[a-z0-9]{2,8})*$'
      OR (item->>'code')=ANY(codes)
      OR jsonb_typeof(item->'primaryDictionarySlug') IS DISTINCT FROM 'string'
      OR length(item->>'primaryDictionarySlug') NOT BETWEEN 1 AND 160
      OR btrim(item->>'primaryDictionarySlug') IS DISTINCT FROM item->>'primaryDictionarySlug'
      OR jsonb_typeof(item->'trainingName') IS DISTINCT FROM 'string'
      OR length(btrim(item->>'trainingName')) NOT BETWEEN 1 AND 160
      OR jsonb_typeof(item->'disabledDictionarySlugs') IS DISTINCT FROM 'array' THEN RETURN false; END IF;
    codes := array_append(codes,item->>'code');
    slugs := ARRAY[item->>'primaryDictionarySlug'];
    IF jsonb_array_length(item->'disabledDictionarySlugs')>1000 THEN RETURN false; END IF;
    FOR slug IN SELECT value FROM jsonb_array_elements(item->'disabledDictionarySlugs') LOOP
      IF jsonb_typeof(slug)<>'string' OR length(slug#>>'{}') NOT BETWEEN 1 AND 160
        OR btrim(slug#>>'{}') IS DISTINCT FROM slug#>>'{}'
        OR (slug#>>'{}')=ANY(slugs) THEN RETURN false; END IF;
      slugs := array_append(slugs,slug#>>'{}');
    END LOOP;
  END LOOP;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION private.is_valid_new_learner_defaults_v1(jsonb) FROM PUBLIC, anon, authenticated, service_role;
ALTER TABLE private.new_learner_defaults ADD CONSTRAINT new_learner_defaults_document_check
  CHECK (private.is_valid_new_learner_defaults_v1(document));

-- Resolve stable identities each time, checking publication/access and the SAME
-- eligible-card selector used by training. Never substitute a legacy catalog.
CREATE FUNCTION private.resolve_new_learner_defaults_v1(p_document jsonb, p_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql SET search_path TO pg_catalog, public, private, pg_temp AS $$
DECLARE
  item jsonb; v_slug text; source public.dictionaries%rowtype; primary_id uuid;
  disabled jsonb := '[]'; languages jsonb := '[]'; trainings jsonb := '[]';
  training_id text; main_id text; filter jsonb;
BEGIN
  IF NOT private.is_valid_new_learner_defaults_v1(p_document) OR p_document IS NULL THEN
    RAISE EXCEPTION 'invalid_new_learner_defaults' USING ERRCODE='22023';
  END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(p_document->'languages') LOOP
    SELECT * INTO source FROM public.dictionaries
      WHERE language_code=item->>'code' AND slug=item->>'primaryDictionarySlug' FOR SHARE;
    IF NOT FOUND OR source.kind<>'curated' OR source.publication_state<>'general'
      OR COALESCE(source.minimum_subscription_tier,'free')<>'free'
      OR NOT public.can_access_dictionary(p_user_id,source.id,'read') THEN
      RAISE EXCEPTION 'new_learner_primary_unavailable: %/%',item->>'code',item->>'primaryDictionarySlug'
        USING ERRCODE='22023';
    END IF;
    primary_id := source.id;
    filter := jsonb_build_object('dictionaryScope',jsonb_build_object(
      'mode','selected','languageCode',item->>'code','dictionaryIds',jsonb_build_array(primary_id)));
    IF NOT EXISTS (SELECT 1 FROM private.training_recipe_eligible_cards_v1(
      p_user_id,ARRAY['word-to-definition'],NULL,'curated','both','auto','{}'::uuid[],'{}'::text[],filter,false,false)) THEN
      RAISE EXCEPTION 'new_learner_primary_empty: %/%',item->>'code',item->>'primaryDictionarySlug'
        USING ERRCODE='22023';
    END IF;
    FOR v_slug IN SELECT value FROM jsonb_array_elements_text(item->'disabledDictionarySlugs') LOOP
      SELECT * INTO source FROM public.dictionaries
        WHERE language_code=item->>'code' AND dictionaries.slug=v_slug FOR SHARE;
      IF NOT FOUND OR source.kind<>'curated' THEN
        RAISE EXCEPTION 'new_learner_disabled_source_unknown: %/%',item->>'code',v_slug USING ERRCODE='22023';
      END IF;
      disabled := disabled || jsonb_build_array(source.id);
    END LOOP;
    training_id := gen_random_uuid()::text;
    main_id := COALESCE(main_id,training_id);
    languages := languages || jsonb_build_array(jsonb_build_object('code',item->>'code','paused',false));
    trainings := trainings || jsonb_build_array(jsonb_build_object(
      'id',training_id,'name',btrim(item->>'trainingName'),'languageCode',item->>'code',
      'draft',jsonb_build_object('family','meaning','scenarioId','understanding',
        'modes',jsonb_build_array('word-to-definition'),'cardFilter','both',
        'listValue','','materialMode','selected-dictionaries','dictionaryIds',jsonb_build_array(primary_id),
        'newReviewRatio',2,'sessionSize',10,'dateWindow','all','sourceValue','all')));
  END LOOP;
  IF jsonb_array_length(disabled)>1000 THEN
    RAISE EXCEPTION 'too_many_disabled_sources' USING ERRCODE='22023';
  END IF;
  RETURN jsonb_build_object('languageCode',p_document#>>'{languages,0,code}',
    'materialPreferences',jsonb_build_object('schemaVersion',1,'learningLanguages',languages,'disabledDictionaryIds',disabled),
    'trainingSetups',jsonb_build_object('schemaVersion',1,'trainings',trainings,'mainTrainingId',main_id));
END;
$$;
REVOKE ALL ON FUNCTION private.resolve_new_learner_defaults_v1(jsonb,uuid) FROM PUBLIC, anon, authenticated, service_role;

-- Service-only installation setting, with compare-and-swap to prevent lost edits.
CREATE FUNCTION public.configure_new_learner_defaults_v1(p_expected_revision integer,p_document jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO pg_catalog, public, private, pg_temp AS $$
DECLARE current_revision integer;
BEGIN
  IF p_expected_revision IS NULL OR p_expected_revision<0 OR p_expected_revision>=2147483647
    OR NOT private.is_valid_new_learner_defaults_v1(p_document) THEN
    RAISE EXCEPTION 'invalid_new_learner_defaults' USING ERRCODE='22023';
  END IF;
  SELECT revision INTO current_revision FROM private.new_learner_defaults WHERE singleton FOR UPDATE;
  IF current_revision<>p_expected_revision THEN
    RETURN jsonb_build_object('conflict',true,'revision',current_revision);
  END IF;
  IF p_document IS NOT NULL THEN
    PERFORM private.resolve_new_learner_defaults_v1(p_document,NULL);
  END IF;
  UPDATE private.new_learner_defaults SET document=p_document,revision=revision+1,updated_at=now() WHERE singleton;
  RETURN jsonb_build_object('conflict',false,'revision',current_revision+1);
END;
$$;
REVOKE ALL ON FUNCTION public.configure_new_learner_defaults_v1(integer,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.configure_new_learner_defaults_v1(integer,jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.set_default_user_settings() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO pg_catalog, public, private, pg_temp AS $$
DECLARE policy private.new_learner_defaults%rowtype; resolved jsonb;
BEGIN
  IF EXISTS (SELECT 1 FROM public.admin_operators op
    WHERE op.email=lower(btrim(NEW.email)) AND op.is_active) THEN RETURN NEW; END IF;

  INSERT INTO public.user_settings(user_id) VALUES(NEW.id) ON CONFLICT DO NOTHING;
  IF NOT FOUND THEN RETURN NEW; END IF;
  -- Only the auth.users INSERT event can enter this path. Neither login nor an
  -- old revision-zero/missing-settings account is an initialization signal.
  SELECT * INTO policy FROM private.new_learner_defaults WHERE singleton FOR SHARE;
  IF policy.document IS NULL THEN RETURN NEW; END IF;
  resolved := private.resolve_new_learner_defaults_v1(policy.document,NEW.id);
  UPDATE public.user_settings SET
    language_code=resolved->>'languageCode',
    material_preferences=resolved->'materialPreferences',material_preferences_revision=1,
    training_setups=resolved->'trainingSetups',training_setups_revision=1
    WHERE user_id=NEW.id;
  INSERT INTO private.new_learner_initializations(user_id,defaults_revision) VALUES(NEW.id,policy.revision);
  RETURN NEW;
END;
$$;
-- CREATE OR REPLACE retains the existing trigger ACL (service/auth-admin only).
COMMIT;
