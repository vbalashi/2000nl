DO $probe$
DECLARE expected record;
BEGIN
 FOR expected IN SELECT * FROM (VALUES
 ('training_animation_enabled','true'),
 ('training_grade_swipe_enabled','false'),
 ('training_translation_swipe_enabled','false'),
 ('training_syllable_double_tap_enabled','false')) AS flags(name, default_value)
 LOOP
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='user_settings'
   AND column_name=expected.name AND data_type='boolean' AND is_nullable='NO' AND column_default=expected.default_value)
  THEN RAISE EXCEPTION 'invalid training interaction column %',expected.name; END IF;
 END LOOP;
 IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid='public.user_settings'::regclass)
 THEN RAISE EXCEPTION 'user settings must retain RLS'; END IF;
END;
$probe$;
