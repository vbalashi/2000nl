-- Dictionary boundary: meaning_id contract, runtime dictionary registry, and list language metadata.
-- Generated: 2026-05-17
--
-- This migration is intentionally additive for existing deployments. It keeps the
-- legacy (language_code, headword, meaning_id) writer contract until ingestion is
-- updated to write dictionary_id explicitly.

CREATE TABLE IF NOT EXISTS dictionary_schemas (
    schema_key text NOT NULL,
    version int NOT NULL DEFAULT 1 CHECK (version > 0),
    language_code text REFERENCES languages(code),
    title text NOT NULL,
    description text,
    json_schema jsonb NOT NULL DEFAULT '{}'::jsonb,
    checksum text,
    source_path text,
    render_capabilities text[] NOT NULL DEFAULT ARRAY[]::text[],
    created_at timestamptz DEFAULT now(),
    retired_at timestamptz,
    PRIMARY KEY (schema_key, version)
);

INSERT INTO dictionary_schemas (
    schema_key,
    version,
    language_code,
    title,
    description,
    source_path,
    render_capabilities
)
VALUES (
    'nl-vandale-v1',
    1,
    'nl',
    'Dutch VanDale entry schema',
    'Runtime registry row for the current Dutch VanDale-shaped dictionary JSON payload.',
    'packages/shared/schemas/nl/note.schema.json',
    ARRAY['definitions', 'examples', 'idioms', 'audio', 'images', 'morphology', 'conjugation']
)
ON CONFLICT (schema_key, version) DO UPDATE
SET language_code = excluded.language_code,
    title = excluded.title,
    description = excluded.description,
    source_path = excluded.source_path,
    render_capabilities = excluded.render_capabilities;

CREATE TABLE IF NOT EXISTS dictionaries (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    language_code text NOT NULL REFERENCES languages(code),
    slug text NOT NULL,
    name text NOT NULL,
    description text,
    kind text NOT NULL DEFAULT 'curated' CHECK (kind IN ('curated', 'user')),
    visibility text NOT NULL DEFAULT 'system' CHECK (visibility IN ('system', 'private', 'shared', 'public')),
    owner_user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
    is_editable boolean NOT NULL DEFAULT false,
    minimum_subscription_tier text DEFAULT 'free',
    access_policy_key text,
    schema_key text,
    schema_version int,
    source_provider text,
    source_version text,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    UNIQUE(language_code, slug),
    FOREIGN KEY (schema_key, schema_version) REFERENCES dictionary_schemas(schema_key, version)
);

INSERT INTO dictionaries (
    language_code,
    slug,
    name,
    description,
    kind,
    visibility,
    is_editable,
    minimum_subscription_tier,
    schema_key,
    schema_version,
    source_provider
)
VALUES (
    'nl',
    'nl-vandale',
    'VanDale Dutch',
    'Trusted Dutch VanDale-backed dictionary used by the current 2000nl training app.',
    'curated',
    'system',
    false,
    'free',
    'nl-vandale-v1',
    1,
    'vandale'
)
ON CONFLICT (language_code, slug) DO UPDATE
SET name = excluded.name,
    description = excluded.description,
    kind = excluded.kind,
    visibility = excluded.visibility,
    is_editable = excluded.is_editable,
    minimum_subscription_tier = excluded.minimum_subscription_tier,
    schema_key = excluded.schema_key,
    schema_version = excluded.schema_version,
    source_provider = excluded.source_provider,
    updated_at = now();

ALTER TABLE word_entries
    ADD COLUMN IF NOT EXISTS meaning_id int;

UPDATE word_entries
SET meaning_id = COALESCE(
    meaning_id,
    CASE
        WHEN raw ? 'meaning_id' AND raw->>'meaning_id' ~ '^[0-9]+$'
            THEN NULLIF((raw->>'meaning_id')::int, 0)
        ELSE NULL
    END,
    1
)
WHERE meaning_id IS NULL;

ALTER TABLE word_entries
    ALTER COLUMN meaning_id SET DEFAULT 1,
    ALTER COLUMN meaning_id SET NOT NULL;

DROP INDEX IF EXISTS word_entries_language_headword_idx;

CREATE UNIQUE INDEX IF NOT EXISTS word_entries_language_headword_meaning_idx
    ON word_entries(language_code, headword, meaning_id);

ALTER TABLE word_entries
    ADD COLUMN IF NOT EXISTS dictionary_id uuid REFERENCES dictionaries(id);

UPDATE word_entries
SET dictionary_id = (
    SELECT id FROM dictionaries
    WHERE language_code = 'nl' AND slug = 'nl-vandale'
)
WHERE dictionary_id IS NULL
  AND language_code = 'nl';

CREATE INDEX IF NOT EXISTS word_entries_dictionary_idx
    ON word_entries(dictionary_id);

CREATE INDEX IF NOT EXISTS word_entries_dictionary_language_headword_idx
    ON word_entries(dictionary_id, language_code, lower(headword));

CREATE UNIQUE INDEX IF NOT EXISTS word_entries_dictionary_language_headword_meaning_idx
    ON word_entries(dictionary_id, language_code, headword, meaning_id)
    WHERE dictionary_id IS NOT NULL;

CREATE OR REPLACE FUNCTION assign_word_entry_default_dictionary()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
    IF NEW.dictionary_id IS NULL AND NEW.language_code = 'nl' THEN
        SELECT id INTO NEW.dictionary_id
        FROM dictionaries
        WHERE language_code = 'nl' AND slug = 'nl-vandale';
    END IF;

    RETURN NEW;
END;
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger WHERE tgname = 'trg_word_entries_default_dictionary'
    ) THEN
        CREATE TRIGGER trg_word_entries_default_dictionary
        BEFORE INSERT OR UPDATE OF dictionary_id, language_code ON word_entries
        FOR EACH ROW EXECUTE FUNCTION assign_word_entry_default_dictionary();
    END IF;
END $$;

ALTER TABLE word_lists
    ADD COLUMN IF NOT EXISTS primary_language_code text REFERENCES languages(code);

UPDATE word_lists
SET primary_language_code = COALESCE(primary_language_code, language_code)
WHERE primary_language_code IS NULL;

ALTER TABLE user_word_lists
    ADD COLUMN IF NOT EXISTS primary_language_code text REFERENCES languages(code);

UPDATE user_word_lists
SET primary_language_code = COALESCE(primary_language_code, language_code)
WHERE primary_language_code IS NULL;

CREATE TABLE IF NOT EXISTS dictionary_entitlements (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    dictionary_id uuid NOT NULL REFERENCES dictionaries(id) ON DELETE CASCADE,
    subject_type text NOT NULL CHECK (subject_type IN ('user', 'group', 'tier', 'client')),
    subject_key text NOT NULL,
    permission text NOT NULL CHECK (permission IN ('read', 'write', 'admin')),
    starts_at timestamptz,
    ends_at timestamptz,
    created_at timestamptz DEFAULT now(),
    UNIQUE(dictionary_id, subject_type, subject_key, permission)
);

CREATE INDEX IF NOT EXISTS dictionary_entitlements_lookup_idx
    ON dictionary_entitlements(dictionary_id, subject_type, subject_key, permission);

CREATE OR REPLACE FUNCTION can_access_dictionary(
    p_user_id uuid,
    p_dictionary_id uuid,
    p_permission text DEFAULT 'read'
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
DECLARE
    v_dictionary dictionaries%rowtype;
    v_user_tier text;
    v_required_tier text;
    v_user_rank int;
    v_required_rank int;
BEGIN
    SELECT * INTO v_dictionary
    FROM dictionaries
    WHERE id = p_dictionary_id;

    IF NOT FOUND THEN
        RETURN false;
    END IF;

    IF p_permission NOT IN ('read', 'write', 'admin') THEN
        RETURN false;
    END IF;

    IF p_user_id IS NOT NULL AND v_dictionary.owner_user_id = p_user_id THEN
        RETURN true;
    END IF;

    SELECT COALESCE(subscription_tier, 'free')
    INTO v_user_tier
    FROM user_settings
    WHERE user_id = p_user_id;

    v_user_tier := COALESCE(v_user_tier, 'free');
    v_required_tier := COALESCE(v_dictionary.minimum_subscription_tier, 'free');

    v_user_rank := CASE v_user_tier
        WHEN 'admin' THEN 30
        WHEN 'premium' THEN 20
        ELSE 10
    END;

    v_required_rank := CASE v_required_tier
        WHEN 'admin' THEN 30
        WHEN 'premium' THEN 20
        ELSE 10
    END;

    IF p_permission = 'read'
       AND v_dictionary.visibility IN ('system', 'public', 'shared')
       AND v_user_rank >= v_required_rank THEN
        RETURN true;
    END IF;

    RETURN EXISTS (
        SELECT 1
        FROM dictionary_entitlements e
        WHERE e.dictionary_id = p_dictionary_id
          AND (
                (e.subject_type = 'user' AND e.subject_key = p_user_id::text)
             OR (e.subject_type = 'tier' AND e.subject_key = v_user_tier)
          )
          AND (
                e.permission = p_permission
             OR e.permission = 'admin'
             OR (p_permission = 'read' AND e.permission = 'write')
          )
          AND (e.starts_at IS NULL OR e.starts_at <= now())
          AND (e.ends_at IS NULL OR e.ends_at > now())
    );
END;
$$;

ALTER TABLE dictionary_schemas ENABLE ROW LEVEL SECURITY;
ALTER TABLE dictionaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE dictionary_entitlements ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'dictionary_schemas'
          AND policyname = 'dictionary_schemas_select_all'
    ) THEN
        CREATE POLICY dictionary_schemas_select_all ON dictionary_schemas
            FOR SELECT TO anon, authenticated USING (retired_at IS NULL OR retired_at > now());
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'dictionaries'
          AND policyname = 'dictionaries_select_accessible'
    ) THEN
        CREATE POLICY dictionaries_select_accessible ON dictionaries
            FOR SELECT TO anon, authenticated USING (
                can_access_dictionary((select auth.uid()), id, 'read')
            );
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'dictionary_entitlements'
          AND policyname = 'dictionary_entitlements_select_admin'
    ) THEN
        CREATE POLICY dictionary_entitlements_select_admin ON dictionary_entitlements
            FOR SELECT TO authenticated USING (
                can_access_dictionary((select auth.uid()), dictionary_id, 'admin')
            );
    END IF;
END $$;

GRANT SELECT ON dictionary_schemas TO anon, authenticated;
GRANT SELECT ON dictionaries TO anon, authenticated;
GRANT SELECT ON dictionary_entitlements TO authenticated;
GRANT EXECUTE ON FUNCTION can_access_dictionary(uuid, uuid, text) TO anon, authenticated;
