-- #716: independent, optional full-card translation. No learning semantics.
BEGIN;
ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS secondary_translation_lang text;
COMMENT ON COLUMN public.user_settings.secondary_translation_lang IS
  'Optional additional full-card translation language. NULL disables it; never used for exercise questions.';
COMMIT;
