-- Scope word form imports/lookups by dictionary metadata.
-- Generated: 2026-05-17

ALTER TABLE word_forms
    ADD COLUMN IF NOT EXISTS dictionary_id uuid REFERENCES dictionaries(id);

UPDATE word_forms wf
SET dictionary_id = we.dictionary_id
FROM word_entries we
WHERE wf.word_id = we.id
  AND wf.dictionary_id IS NULL;

CREATE INDEX IF NOT EXISTS word_forms_dictionary_form_idx
    ON word_forms(dictionary_id, language_code, form);
