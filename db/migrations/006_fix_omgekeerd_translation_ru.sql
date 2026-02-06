-- Data fix: ensure 'omgekeerd' has a non-empty RU translation overlay headword.
--
-- Background:
-- Some cross-reference-only verb entries have `raw.meanings = []`, which makes our
-- translation extractor produce an empty fingerprint payload (`[]`). The API
-- route then caches an overlay with `headword: ""`. This migration patches the
-- cached overlay so the UI shows a useful translation instead of "—".
--
-- Idempotent: only updates/inserts when headword is missing/blank.

\set ON_ERROR_STOP on

INSERT INTO word_entry_translations (
    word_entry_id,
    target_lang,
    provider,
    status,
    overlay,
    source_fingerprint,
    error_message,
    created_at,
    updated_at
)
SELECT
    w.id,
    'ru',
    'deepl',
    'ready',
    '{"headword":"наоборот","meanings":[{}]}'::jsonb,
    encode(digest('[]', 'sha256'), 'hex'),
    NULL,
    now(),
    now()
FROM word_entries w
WHERE w.language_code = 'nl'
  AND w.headword = 'omgekeerd'
ON CONFLICT (word_entry_id, target_lang, provider) DO UPDATE
SET
    status = 'ready',
    overlay = jsonb_set(
        COALESCE(word_entry_translations.overlay, '{"meanings":[{}]}'::jsonb),
        '{headword}',
        to_jsonb('наоборот'::text),
        true
    ),
    -- Preserve existing fingerprint if present; otherwise set the known empty-payload fingerprint.
    source_fingerprint = COALESCE(word_entry_translations.source_fingerprint, EXCLUDED.source_fingerprint),
    error_message = NULL,
    updated_at = now()
WHERE NULLIF(trim(COALESCE(word_entry_translations.overlay->>'headword', '')), '') IS NULL;

