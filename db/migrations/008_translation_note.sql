-- Add contextual translation note field (nullable).
-- This stores a brief (1-2 sentence) note about common meaning vs example-specific meaning.

ALTER TABLE IF EXISTS word_entry_translations
    ADD COLUMN IF NOT EXISTS note text;

