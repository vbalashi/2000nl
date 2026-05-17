-- Drop legacy global word entry uniqueness after ingestion writes dictionary_id.
-- Generated: 2026-05-17
--
-- Dictionary ownership is now part of entry identity, so duplicate
-- language/headword/meaning rows are allowed across different dictionaries.

DROP INDEX IF EXISTS word_entries_language_headword_meaning_idx;

CREATE UNIQUE INDEX IF NOT EXISTS word_entries_dictionary_language_headword_meaning_idx
    ON word_entries(dictionary_id, language_code, headword, meaning_id)
    WHERE dictionary_id IS NOT NULL;
