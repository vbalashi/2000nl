-- Fresh installs only. Operators configure the primary dictionary separately.
BEGIN;
CREATE TABLE private.starter_training_config (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  dictionary_id uuid REFERENCES public.dictionaries(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE private.starter_training_config ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.starter_training_config FROM PUBLIC, anon, authenticated, service_role;
INSERT INTO private.starter_training_config(singleton) VALUES (true);

-- A row is created only during registration, never inferred from an empty list.
CREATE TABLE private.starter_training_initializations (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','complete','superseded')),
  last_failure text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE private.starter_training_initializations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.starter_training_initializations FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION private.initialize_starter_training_v1(p_user_id uuid) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,private,pg_temp AS $$
DECLARE state private.starter_training_initializations%rowtype; settings public.user_settings%rowtype;
  dictionary public.dictionaries%rowtype; training_id text; failure text;
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
    ELSIF NOT EXISTS (SELECT 1 FROM private.vocabulary_frequency_profiles WHERE language_code='nl' AND profile='spoken' AND max_rank >= 100)
      OR (SELECT count(*) FROM private.vocabulary_frequency_ranks WHERE language_code='nl' AND profile='spoken' AND rank BETWEEN 1 AND 100) <> 100 THEN
      failure := 'spoken_frequency_unavailable';
    ELSIF (SELECT count(DISTINCT r.rank) FROM private.active_word_entries e JOIN private.vocabulary_frequency_ranks r
        ON r.language_code=e.language_code AND r.profile='spoken' AND r.rank BETWEEN 1 AND 100
        AND r.spelling_key=private.vocabulary_spelling_key_v1(e.headword)
      WHERE e.dictionary_id=dictionary.id AND e.language_code='nl'
    ) <> 100 THEN failure := 'dictionary_frequency_unavailable';
    ELSIF NOT EXISTS (SELECT 1 FROM private.training_recipe_eligible_cards_v1(
      p_user_id,ARRAY['word-to-definition'],NULL,'curated','both','auto',ARRAY[]::uuid[],ARRAY[]::text[],
      jsonb_build_object('dictionaryScope',jsonb_build_object('mode','selected','languageCode','nl','dictionaryIds',jsonb_build_array(dictionary.id)),
        'vocabulary',jsonb_build_object('mode','frequency','materialKinds','[]'::jsonb,'profile','spoken','from',1,'to',100,'meanings','all')),
      false,false) WHERE intrinsic_source='new') THEN
      failure := 'starter_cards_unavailable';
    END IF;
  END IF;
  IF failure IS NOT NULL THEN
    UPDATE private.starter_training_initializations SET last_failure=failure,updated_at=now() WHERE user_id=p_user_id;
    RETURN 'pending';
  END IF;
  training_id := gen_random_uuid()::text;
  UPDATE public.user_settings SET training_setups=jsonb_build_object('schemaVersion',1,'mainTrainingId',training_id,
    'trainings',jsonb_build_array(jsonb_build_object('id',training_id,'name','Dilum Nederlands — Top 100','languageCode','nl',
      'draft',jsonb_build_object('family','meaning','scenarioId','understanding','modes',jsonb_build_array('word-to-definition','definition-to-word'),
      'cardFilter','both','listValue','','sourceValue','all','materialMode','selected-dictionaries','dictionaryIds',jsonb_build_array(dictionary.id),
      'newReviewRatio',2,'dateWindow','all','sessionSize',10,
      'vocabulary',jsonb_build_object('mode','frequency','materialKinds','[]'::jsonb,'profile','spoken','from',1,'to',100,'meanings','all'))))),
    training_setups_revision=training_setups_revision+1,updated_at=now() WHERE user_id=p_user_id;
  UPDATE private.starter_training_initializations SET status='complete',last_failure=NULL,updated_at=now() WHERE user_id=p_user_id;
  RETURN 'complete';
END;
$$;
REVOKE ALL ON FUNCTION private.initialize_starter_training_v1(uuid) FROM PUBLIC,anon,authenticated,service_role;

-- One SQL statement obtains setup and status from the same MVCC snapshot.
CREATE FUNCTION public.read_account_starter_snapshot_v1() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,private,pg_temp AS $$
DECLARE principal uuid := auth.uid(); result jsonb;
BEGIN
  IF principal IS NULL OR NOT COALESCE(private.admission_allowed(principal),false) THEN RAISE EXCEPTION 'unauthorized' USING ERRCODE='42501'; END IF;
  SELECT jsonb_build_object(
    'revision',COALESCE(settings.training_setups_revision,0),
    'document',COALESCE(settings.training_setups,'{"schemaVersion":1,"trainings":[],"mainTrainingId":null}'::jsonb),
    'starterStatus',COALESCE(initialization.status,'not_applicable'))
  INTO result FROM (SELECT principal AS user_id) p
  LEFT JOIN public.user_settings settings ON settings.user_id=p.user_id
  LEFT JOIN private.starter_training_initializations initialization ON initialization.user_id=p.user_id;
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.read_account_starter_snapshot_v1() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.read_account_starter_snapshot_v1() TO authenticated;

CREATE FUNCTION public.retry_starter_training_v1() RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,private,pg_temp AS $$
DECLARE principal uuid := auth.uid();
BEGIN
  IF principal IS NULL OR NOT COALESCE(private.admission_allowed(principal),false) THEN RAISE EXCEPTION 'unauthorized' USING ERRCODE='42501'; END IF;
  BEGIN
    RETURN private.initialize_starter_training_v1(principal);
  EXCEPTION WHEN OTHERS THEN
    UPDATE private.starter_training_initializations SET last_failure='unexpected_error',updated_at=now()
      WHERE user_id=principal AND status='pending';
    RAISE WARNING 'starter training retry failed: %', SQLSTATE;
    RETURN 'pending';
  END;
END;
$$;
REVOKE ALL ON FUNCTION public.retry_starter_training_v1() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.retry_starter_training_v1() TO authenticated;

CREATE OR REPLACE FUNCTION public.set_default_user_settings() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,private,pg_temp AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.admin_operators op WHERE op.email=lower(btrim(NEW.email)) AND op.is_active) THEN RETURN NEW; END IF;
  INSERT INTO public.user_settings(user_id) VALUES(NEW.id) ON CONFLICT DO NOTHING;
  IF NOT FOUND THEN RETURN NEW; END IF;
  BEGIN
    INSERT INTO private.starter_training_initializations(user_id) VALUES(NEW.id);
    -- Only record intent here; dictionary checks run after registration commits.
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'starter training initialization failed for new account: %', SQLSTATE;
    BEGIN
      INSERT INTO private.starter_training_initializations(user_id,last_failure) VALUES(NEW.id,'unexpected_error')
      ON CONFLICT(user_id) DO UPDATE SET last_failure='unexpected_error',updated_at=now();
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'starter training pending record failed: %', SQLSTATE;
    END;
  END;
  RETURN NEW;
END;
$$;
NOTIFY pgrst, 'reload schema';
COMMIT;
