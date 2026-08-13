-- Preserve selected/actual provider provenance without storing provider diagnostics.

ALTER TABLE platform_text_translations
  ADD COLUMN IF NOT EXISTS provider_used text,
  ADD COLUMN IF NOT EXISTS used_fallback boolean;

ALTER TABLE platform_text_translations
  ALTER COLUMN used_fallback DROP DEFAULT,
  ALTER COLUMN used_fallback DROP NOT NULL;

ALTER TABLE platform_text_translations
  DROP CONSTRAINT IF EXISTS platform_text_translations_provider_used_check;

ALTER TABLE platform_text_translations
  ADD CONSTRAINT platform_text_translations_provider_used_check
  CHECK (provider_used IS NULL OR provider_used IN ('deepl', 'openai', 'gemini'));

COMMENT ON COLUMN platform_text_translations.used_fallback IS
  'NULL means unknown historical provenance; new application writes use true or false.';
