-- Core Schema: Tables, indexes, and extensions
-- Generated: 2025-12-31
-- This file contains the canonical table structure for fresh deploys.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- =============================================================================
-- LANGUAGES & WORD ENTRIES
-- =============================================================================

CREATE TABLE IF NOT EXISTS languages (
    code text PRIMARY KEY,
    name text NOT NULL
);

-- Seed languages
INSERT INTO languages (code, name) VALUES ('nl', 'Nederlands')
ON CONFLICT (code) DO NOTHING;

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

CREATE TABLE IF NOT EXISTS word_entries (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    dictionary_id uuid REFERENCES dictionaries(id),
    language_code text NOT NULL REFERENCES languages(code),
    headword text NOT NULL,
    meaning_id int NOT NULL DEFAULT 1,
    part_of_speech text,
    gender text,
    is_nt2_2000 boolean DEFAULT false,
    vandale_id int,
    raw jsonb NOT NULL,
    created_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS word_entries_language_headword_meaning_idx
    ON word_entries(language_code, headword, meaning_id);

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

-- =============================================================================
-- CURATED WORD LISTS (system-defined lists)
-- =============================================================================

CREATE TABLE IF NOT EXISTS word_lists (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    language_code text NOT NULL REFERENCES languages(code),
    primary_language_code text REFERENCES languages(code),
    slug text NOT NULL,
    name text NOT NULL,
    description text,
    is_primary boolean DEFAULT false,
    sort_order int DEFAULT 100, -- Display order in UI (lower = higher priority)
    UNIQUE(language_code, slug)
);

-- Seed curated word lists
-- VanDale (full) - all dictionary entries
INSERT INTO word_lists (language_code, slug, name, description, is_primary, sort_order)
VALUES ('nl', 'vandale-all', 'VanDale', 'Volledige VanDale woordenboek (alle woorden)', false, 10)
ON CONFLICT (language_code, slug) DO UPDATE
SET name = 'VanDale', description = 'Volledige VanDale woordenboek (alle woorden)', sort_order = 10;

-- VanDale 2k - NT2 essential 2000 words
INSERT INTO word_lists (language_code, slug, name, description, is_primary, sort_order)
VALUES ('nl', 'nt2-2000', 'VanDale 2k', 'Belangrijkste 2000 woorden voor NT2', true, 20)
ON CONFLICT (language_code, slug) DO UPDATE
SET name = 'VanDale 2k', sort_order = 20;

UPDATE word_lists
SET primary_language_code = COALESCE(primary_language_code, language_code)
WHERE primary_language_code IS NULL;

CREATE TABLE IF NOT EXISTS word_list_items (
    list_id uuid NOT NULL REFERENCES word_lists(id) ON DELETE CASCADE,
    word_id uuid NOT NULL REFERENCES word_entries(id) ON DELETE CASCADE,
    rank int,
    PRIMARY KEY (list_id, word_id)
);

-- =============================================================================
-- WORD FORMS (inflections, conjugations)
-- =============================================================================

CREATE TABLE IF NOT EXISTS word_forms (
    language_code text NOT NULL REFERENCES languages(code),
    form text NOT NULL,
    word_id uuid NOT NULL REFERENCES word_entries(id) ON DELETE CASCADE,
    headword text NOT NULL,
    created_at timestamptz DEFAULT now(),
    PRIMARY KEY (language_code, form, word_id)
);

CREATE INDEX IF NOT EXISTS word_forms_form_idx
    ON word_forms(form);

CREATE INDEX IF NOT EXISTS word_forms_language_form_idx
    ON word_forms(language_code, form);

-- =============================================================================
-- USER WORD STATUS (FSRS state per user/word/mode)
-- =============================================================================

CREATE TABLE IF NOT EXISTS user_word_status (
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    word_id uuid NOT NULL REFERENCES word_entries(id) ON DELETE CASCADE,
    mode text NOT NULL, -- 'word-to-definition', 'definition-to-word', etc.
    
    -- Legacy SM2 fields (retained for historical data)
    sm2_n int DEFAULT 0,
    sm2_ef float DEFAULT 2.5,
    sm2_interval int DEFAULT 0,
    
    -- FSRS-6 fields
    fsrs_stability numeric,
    fsrs_difficulty numeric,
    fsrs_reps int DEFAULT 0,
    fsrs_lapses int DEFAULT 0,
    fsrs_last_grade smallint,
    fsrs_last_interval numeric,
    fsrs_target_retention numeric DEFAULT 0.9,
    fsrs_params_version text DEFAULT 'fsrs-6-default',
    fsrs_enabled boolean DEFAULT false,
    
    -- Scheduling
    next_review_at timestamptz DEFAULT now(),
    last_seen_at timestamptz DEFAULT now(),
    last_reviewed_at timestamptz,
    
    -- Interaction stats
    click_count int DEFAULT 0,
    seen_count int DEFAULT 0,
    success_count int DEFAULT 0,
    
    -- State flags
    last_result text,
    hidden boolean DEFAULT false,
    frozen_until timestamptz,
    
    -- Learning state (for sub-day intervals)
    in_learning boolean DEFAULT false,
    learning_due_at timestamptz,
    
    PRIMARY KEY (user_id, word_id, mode)
);

CREATE INDEX IF NOT EXISTS user_word_status_next_review_idx
    ON user_word_status(user_id, mode, next_review_at);

CREATE INDEX IF NOT EXISTS user_word_status_clicks_idx
    ON user_word_status(user_id, mode, click_count DESC);

CREATE INDEX IF NOT EXISTS user_word_status_fsrs_next_idx
    ON user_word_status(user_id, mode, next_review_at);

-- =============================================================================
-- USER REVIEW LOG (audit trail)
-- =============================================================================

CREATE TABLE IF NOT EXISTS user_review_log (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    word_id uuid NOT NULL REFERENCES word_entries(id) ON DELETE CASCADE,
    mode text NOT NULL,
    grade smallint NOT NULL,
    review_type text NOT NULL, -- 'new', 'review', 'click'
    scheduled_at timestamptz,
    reviewed_at timestamptz DEFAULT now(),
    response_ms int,
    stability_before numeric,
    difficulty_before numeric,
    stability_after numeric,
    difficulty_after numeric,
    interval_after numeric,
    params_version text DEFAULT 'fsrs-6-default',
    metadata jsonb
);

CREATE INDEX IF NOT EXISTS user_review_log_user_idx
    ON user_review_log(user_id, mode, reviewed_at DESC);

-- =============================================================================
-- USER EVENTS (generic event log)
-- =============================================================================

CREATE TABLE IF NOT EXISTS user_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    word_id uuid REFERENCES word_entries(id) ON DELETE SET NULL,
    mode text NOT NULL,
    event_type text NOT NULL,
    created_at timestamptz DEFAULT now(),
    meta jsonb
);

CREATE INDEX IF NOT EXISTS user_events_user_date_idx
    ON user_events(user_id, created_at);

-- =============================================================================
-- TRAINING SCENARIOS
-- =============================================================================

CREATE TABLE IF NOT EXISTS training_scenarios (
    id text PRIMARY KEY,
    name_en text NOT NULL,
    name_nl text,
    description text,
    card_modes text[] NOT NULL,
    graduation_threshold numeric DEFAULT 21,
    enabled boolean DEFAULT true,
    sort_order int DEFAULT 0
);

-- Seed default scenarios
INSERT INTO training_scenarios (id, name_en, name_nl, description, card_modes, graduation_threshold, enabled, sort_order)
VALUES
    ('understanding', 'Understanding', 'Begrip', 
     'Recognize word meaning in both directions', 
     ARRAY['word-to-definition', 'definition-to-word'], 
     21, true, 1),
    ('listening', 'Listening', 'Luisteren', 
     'Audio recognition and spelling',
     ARRAY['listen-recognize', 'listen-type'], 
     21, false, 2),
    ('conjugation', 'Conjugation', 'Vervoegingen', 
     'Practice verb conjugation forms',
     ARRAY['verb-ik-presens', 'verb-jij-presens', 'verb-hij-presens', 
           'verb-wij-presens', 'verb-jullie-presens', 'verb-zij-presens',
           'verb-past-singular', 'verb-past-plural'], 
     21, false, 3)
ON CONFLICT (id) DO NOTHING;

-- =============================================================================
-- POPULATE VANDALE (FULL) LIST
-- This runs on fresh deploy; if no words exist yet, ingestion will populate later.
-- =============================================================================

DO $$
DECLARE
    v_list_id uuid;
    v_inserted int;
BEGIN
    -- Get the VanDale (full) list ID
    SELECT id INTO v_list_id
    FROM word_lists
    WHERE slug = 'vandale-all' AND language_code = 'nl';
    
    IF v_list_id IS NULL THEN
        RAISE NOTICE 'VanDale (full) list not found, skipping population';
        RETURN;
    END IF;
    
    -- Insert all NL word entries that aren't already in the list
    INSERT INTO word_list_items (list_id, word_id, rank)
    SELECT 
        v_list_id,
        w.id,
        ROW_NUMBER() OVER (ORDER BY w.headword ASC)
    FROM word_entries w
    WHERE w.language_code = 'nl'
    ON CONFLICT (list_id, word_id) DO NOTHING;
    
    GET DIAGNOSTICS v_inserted = ROW_COUNT;
    IF v_inserted > 0 THEN
        RAISE NOTICE 'Inserted % words into VanDale (full) list', v_inserted;
    END IF;
END $$;
