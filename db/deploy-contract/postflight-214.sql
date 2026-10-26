\i db/deploy-contract/read-only-postflight-213.sql
DO $probe$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='user_settings'
  AND column_name='training_audio_swipe_enabled' AND data_type='boolean' AND is_nullable='NO' AND column_default='false')
 THEN RAISE EXCEPTION 'invalid training audio swipe column'; END IF;
 IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid='public.user_settings'::regclass)
 THEN RAISE EXCEPTION 'user settings must retain RLS'; END IF;
END;
$probe$;
