-- Separate learner-visible content identity from translation implementation
-- details. Platform V2 only projects translations when both revisions match.

ALTER TABLE public.word_entry_translations
    ADD COLUMN IF NOT EXISTS source_content_revision text,
    ADD COLUMN IF NOT EXISTS translation_policy_version text,
    ADD COLUMN IF NOT EXISTS provider_revision text;

COMMENT ON COLUMN public.word_entry_translations.source_content_revision IS
    'Fingerprint of normalized learner-visible source content translated by this row.';
COMMENT ON COLUMN public.word_entry_translations.translation_policy_version IS
    'Version of the translation policy used to produce this row.';
COMMENT ON COLUMN public.word_entry_translations.provider_revision IS
    'Provider/prompt revision used for diagnostics and cache provenance.';
