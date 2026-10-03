-- Additive appearance choice; retain the default and all existing account values.
BEGIN;
ALTER TABLE public.user_settings
  DROP CONSTRAINT user_settings_practice_palette_check;
ALTER TABLE public.user_settings
  ADD CONSTRAINT user_settings_practice_palette_check
  CHECK (practice_palette IN ('lavender', 'blue', 'indigo', 'graphite'));
COMMIT;
