-- Selection preferences are account-owned; they never grant/revoke dictionary
-- access or mutate current sessions, saved setups, scheduling or action history.
BEGIN;
CREATE OR REPLACE FUNCTION public.is_valid_account_material_preferences_v1(p_document jsonb)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE
SET search_path = pg_catalog, pg_temp AS $$
DECLARE v_item jsonb; v_codes text[] := ARRAY[]::text[]; v_ids text[] := ARRAY[]::text[]; v_active integer := 0;
BEGIN
  IF p_document IS NULL OR jsonb_typeof(p_document) <> 'object'
    OR p_document->'schemaVersion' IS DISTINCT FROM '1'::jsonb
    OR jsonb_typeof(p_document->'learningLanguages') IS DISTINCT FROM 'array'
    OR jsonb_typeof(p_document->'disabledDictionaryIds') IS DISTINCT FROM 'array'
    OR (p_document - ARRAY['schemaVersion','learningLanguages','disabledDictionaryIds']) <> '{}'::jsonb
    OR octet_length(p_document::text) > 65536 THEN RETURN false; END IF;
  IF jsonb_array_length(p_document->'learningLanguages') > 100
    OR jsonb_array_length(p_document->'disabledDictionaryIds') > 1000 THEN RETURN false; END IF;
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_document->'learningLanguages') LOOP
    IF jsonb_typeof(v_item) <> 'object'
      OR jsonb_typeof(v_item->'code') IS DISTINCT FROM 'string'
      OR jsonb_typeof(v_item->'paused') IS DISTINCT FROM 'boolean'
      OR (v_item - ARRAY['code','paused']) <> '{}'::jsonb
      OR length(v_item->>'code') > 35 OR (v_item->>'code') !~ '^[a-z]{2,3}(-[a-z0-9]{2,8})*$'
      OR (v_item->>'code') = ANY(v_codes) THEN RETURN false; END IF;
    v_codes := array_append(v_codes, v_item->>'code');
    IF v_item->'paused' = 'false'::jsonb THEN v_active := v_active + 1; END IF;
  END LOOP;
  -- Empty is the backwards-compatible implicit language catalog. Once a
  -- learner configures an explicit ordered list, retain one active language.
  IF cardinality(v_codes) > 0 AND v_active = 0 THEN RETURN false; END IF;
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_document->'disabledDictionaryIds') LOOP
    IF jsonb_typeof(v_item) <> 'string'
      OR (v_item #>> '{}') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      OR (v_item #>> '{}') = ANY(v_ids) THEN RETURN false; END IF;
    v_ids := array_append(v_ids, v_item #>> '{}');
  END LOOP;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.is_valid_account_material_preferences_v1(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_valid_account_material_preferences_v1(jsonb) TO authenticated, service_role;
ALTER TABLE public.user_settings
 ADD COLUMN IF NOT EXISTS material_preferences jsonb NOT NULL DEFAULT '{"schemaVersion":1,"learningLanguages":[],"disabledDictionaryIds":[]}'::jsonb,
 ADD COLUMN IF NOT EXISTS material_preferences_revision integer NOT NULL DEFAULT 0;
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.user_settings'::regclass AND conname='user_settings_material_preferences_bounds') THEN
  ALTER TABLE public.user_settings ADD CONSTRAINT user_settings_material_preferences_bounds CHECK (
   material_preferences_revision >= 0 AND public.is_valid_account_material_preferences_v1(material_preferences));
 END IF;
END $$;
CREATE OR REPLACE FUNCTION public.save_account_material_preferences_v1(p_expected_revision integer, p_document jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE v_user uuid := auth.uid(); v_revision integer; v_document jsonb;
BEGIN
 IF v_user IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
 IF p_expected_revision IS NULL OR p_expected_revision < 0 OR p_expected_revision >= 2147483647
  OR NOT public.is_valid_account_material_preferences_v1(p_document) THEN
  RAISE EXCEPTION 'Invalid material preferences' USING ERRCODE='22023'; END IF;
 INSERT INTO public.user_settings(user_id) VALUES(v_user) ON CONFLICT(user_id) DO NOTHING;
 SELECT material_preferences_revision, material_preferences INTO v_revision,v_document
 FROM public.user_settings WHERE user_id=v_user FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Account settings unavailable' USING ERRCODE='42501'; END IF;
 IF v_revision <> p_expected_revision THEN
  RETURN jsonb_build_object('conflict',true,'revision',v_revision,'document',v_document);
 END IF;
 UPDATE public.user_settings SET material_preferences=p_document,
  material_preferences_revision=material_preferences_revision+1, updated_at=now()
 WHERE user_id=v_user RETURNING material_preferences_revision INTO v_revision;
 RETURN jsonb_build_object('conflict',false,'revision',v_revision,'document',p_document);
END;
$$;
REVOKE ALL ON FUNCTION public.save_account_material_preferences_v1(integer,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_account_material_preferences_v1(integer,jsonb) TO authenticated;
COMMIT;
