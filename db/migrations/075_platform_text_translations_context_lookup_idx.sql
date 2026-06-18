-- Keep the constituent lookup index aligned with the text translation
-- artifact identity. translation_id remains the primary cache key.

DROP INDEX IF EXISTS platform_text_translations_lookup_idx;

CREATE INDEX IF NOT EXISTS platform_text_translations_lookup_idx
    ON platform_text_translations (
        source_text_hash,
        context_text_hash,
        source_language_code,
        target_language_code,
        purpose,
        translation_policy_version
    );
