-- Run in a disposable/local database. All fixture writes roll back.
BEGIN;
SELECT gen_random_uuid() AS owner_id, gen_random_uuid() AS other_id \gset
INSERT INTO auth.users(id,email) VALUES (:'owner_id','secondary-owner@2000nl.test'),(:'other_id','secondary-other@2000nl.test');
INSERT INTO public.user_settings(user_id,translation_lang) VALUES (:'owner_id','off'),(:'other_id','ru') ON CONFLICT(user_id) DO UPDATE SET translation_lang=EXCLUDED.translation_lang;
SELECT set_config('request.jwt.claim.sub', :'owner_id', true);
SET LOCAL ROLE authenticated;
UPDATE public.user_settings SET secondary_translation_lang='en' WHERE user_id=:'owner_id';
DO $test$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.user_settings WHERE user_id=auth.uid() AND translation_lang='off' AND secondary_translation_lang='en')
  THEN RAISE EXCEPTION 'secondary-only preference did not persist'; END IF;
  IF EXISTS(SELECT 1 FROM public.user_settings WHERE user_id<>auth.uid())
  THEN RAISE EXCEPTION 'another account settings became readable'; END IF;
END $test$;
UPDATE public.user_settings SET secondary_translation_lang='de' WHERE user_id=:'other_id';
UPDATE public.user_settings SET secondary_translation_lang=NULL WHERE user_id=:'owner_id';
DO $test$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.user_settings WHERE user_id=auth.uid() AND translation_lang='off' AND secondary_translation_lang IS NULL)
  THEN RAISE EXCEPTION 'both-off preference did not persist'; END IF;
END $test$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', true);
DO $test$
BEGIN
  IF EXISTS(SELECT 1 FROM public.user_settings s JOIN auth.users u ON u.id=s.user_id WHERE u.email='secondary-other@2000nl.test' AND s.secondary_translation_lang IS NOT NULL)
  THEN RAISE EXCEPTION 'another account settings became writable'; END IF;
END $test$;
ROLLBACK;
