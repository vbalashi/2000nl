-- Platform generic text translation artifacts for external clients.
-- Entry/card translations remain in word_entry_translations.

CREATE TABLE IF NOT EXISTS platform_text_translations (
    translation_id text PRIMARY KEY,
    source_text_hash text NOT NULL,
    source_language_code text NOT NULL,
    target_language_code text NOT NULL,
    purpose text NOT NULL,
    translation_policy_version text NOT NULL,
    context_text_hash text,
    provider text,
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'ready', 'failed')),
    translated_text text,
    error_message text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS platform_text_translations_lookup_idx
    ON platform_text_translations (
        source_text_hash,
        source_language_code,
        target_language_code,
        purpose,
        translation_policy_version
    );

ALTER TABLE platform_text_translations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON platform_text_translations FROM anon, authenticated;
