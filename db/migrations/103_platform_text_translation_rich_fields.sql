-- Preserve rich text-translation output for cached external-client phrase/span translations.

ALTER TABLE platform_text_translations
  ADD COLUMN IF NOT EXISTS literal_translated_text text,
  ADD COLUMN IF NOT EXISTS translator_comment text;
