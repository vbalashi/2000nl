-- First-party saved trainings belong to the account, independently of the
-- preferences JSON and authoritative training/scheduling state.
BEGIN;
ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS training_setups jsonb NOT NULL DEFAULT
    '{"schemaVersion":1,"trainings":[],"mainTrainingId":null}'::jsonb,
  ADD COLUMN IF NOT EXISTS training_setups_revision integer NOT NULL DEFAULT 0;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
    WHERE conrelid='public.user_settings'::regclass AND conname='user_settings_training_setups_bounds') THEN
    ALTER TABLE public.user_settings ADD CONSTRAINT user_settings_training_setups_bounds CHECK (
      training_setups_revision >= 0 AND
      jsonb_typeof(training_setups) = 'object' AND
      training_setups->'schemaVersion' IS NOT DISTINCT FROM '1'::jsonb AND
      jsonb_typeof(training_setups->'trainings') = 'array' AND
      jsonb_array_length(training_setups->'trainings') <= 100 AND
      octet_length(training_setups::text) <= 200000 AND
      training_setups ? 'mainTrainingId'
    );
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.save_account_training_setups_v1(
  p_expected_revision integer, p_document jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_revision integer;
  v_document jsonb;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501';
  END IF;
  IF p_expected_revision IS NULL OR p_expected_revision < 0
     OR p_document IS NULL OR jsonb_typeof(p_document) <> 'object'
     OR p_document->'schemaVersion' IS DISTINCT FROM '1'::jsonb
     OR jsonb_typeof(p_document->'trainings') IS DISTINCT FROM 'array'
     OR NOT p_document ? 'mainTrainingId' THEN
    RAISE EXCEPTION 'Invalid training setups' USING ERRCODE='22023';
  END IF;
  IF jsonb_array_length(p_document->'trainings') > 100
     OR octet_length(p_document::text) > 200000
     OR EXISTS (SELECT 1 FROM jsonb_array_elements(p_document->'trainings') item
       WHERE jsonb_typeof(item) <> 'object'
         OR jsonb_typeof(item->'id') IS DISTINCT FROM 'string'
         OR length(item->>'id') NOT BETWEEN 1 AND 128
         OR jsonb_typeof(item->'name') IS DISTINCT FROM 'string'
         OR length(btrim(item->>'name')) NOT BETWEEN 1 AND 160
         OR jsonb_typeof(item->'languageCode') IS DISTINCT FROM 'string'
         OR (item->>'languageCode') !~ '^[a-z]{2,3}(-[a-z0-9]{2,8})*$'
         OR length(item->>'languageCode') > 35
         OR jsonb_typeof(item->'draft') IS DISTINCT FROM 'object')
     OR (SELECT count(*) FROM jsonb_array_elements(p_document->'trainings')) <>
        (SELECT count(DISTINCT item->>'id') FROM jsonb_array_elements(p_document->'trainings') item)
     OR (p_document->'mainTrainingId' <> 'null'::jsonb AND
       (jsonb_typeof(p_document->'mainTrainingId') <> 'string' OR NOT EXISTS (
         SELECT 1 FROM jsonb_array_elements(p_document->'trainings') item
         WHERE item->'id'=p_document->'mainTrainingId'))) THEN
    RAISE EXCEPTION 'Invalid training setups' USING ERRCODE='22023';
  END IF;
  INSERT INTO public.user_settings(user_id) VALUES (v_user_id)
  ON CONFLICT (user_id) DO NOTHING;
  SELECT training_setups_revision, training_setups INTO v_revision, v_document
  FROM public.user_settings WHERE user_id=v_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Account settings unavailable' USING ERRCODE='42501';
  END IF;
  IF v_revision <> p_expected_revision THEN
    RETURN jsonb_build_object('conflict', true, 'revision', v_revision, 'document', v_document);
  END IF;
  UPDATE public.user_settings SET training_setups=p_document,
    training_setups_revision=training_setups_revision+1, updated_at=now()
  WHERE user_id=v_user_id
  RETURNING training_setups_revision INTO v_revision;
  RETURN jsonb_build_object('conflict', false, 'revision', v_revision, 'document', p_document);
END;
$$;
REVOKE ALL ON FUNCTION public.save_account_training_setups_v1(integer,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_account_training_setups_v1(integer,jsonb) TO authenticated;
COMMIT;
