-- User Features: Settings, lists, translations, and notes
-- Generated: 2025-12-31
-- This file contains user settings, user-created word lists, and word overlays.

-- =============================================================================
-- USER SETTINGS
-- =============================================================================

CREATE TABLE IF NOT EXISTS user_settings (
    user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    
    -- FSRS defaults
    daily_new_limit int DEFAULT 10,
    daily_review_limit int DEFAULT 40,
    mix_mode text DEFAULT 'mixed',
    target_retention numeric DEFAULT 0.9,
    use_fsrs boolean DEFAULT false,
    new_review_ratio int DEFAULT 2,
    
    -- User preferences
    theme_preference text DEFAULT 'system' CHECK (theme_preference IN ('light', 'dark', 'system')),
    training_mode text DEFAULT 'word-to-definition' CHECK (training_mode IN ('word-to-definition', 'definition-to-word')),
    language_code text DEFAULT 'nl',
    
    -- Multi-mode training
    modes_enabled text[] DEFAULT ARRAY['word-to-definition'],
    card_filter text DEFAULT 'both' CHECK (card_filter IN ('new', 'review', 'both')),
    active_scenario text DEFAULT 'understanding',
    
    -- List selection
    active_list_id uuid,
    active_list_type text DEFAULT 'curated' CHECK (active_list_type IN ('curated', 'user')),
    
    -- Translation preferences (default 'en' for new users)
    translation_lang text DEFAULT 'en',
    
    updated_at timestamptz DEFAULT now()
);

-- Trigger to auto-create user_settings on signup
CREATE OR REPLACE FUNCTION public.set_default_user_settings()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.user_settings (user_id)
    VALUES (new.id)
    ON CONFLICT DO NOTHING;
    RETURN new;
END;
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger WHERE tgname = 'trg_user_settings_seed'
    ) THEN
        CREATE TRIGGER trg_user_settings_seed
        AFTER INSERT ON auth.users
        FOR EACH ROW EXECUTE FUNCTION public.set_default_user_settings();
    END IF;
END $$;

-- =============================================================================
-- USER WORD LISTS (user-created lists)
-- =============================================================================

CREATE TABLE IF NOT EXISTS user_word_lists (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    language_code text REFERENCES languages(code),
    name text NOT NULL,
    description text,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    UNIQUE (user_id, name)
);

CREATE TABLE IF NOT EXISTS user_word_list_items (
    list_id uuid NOT NULL REFERENCES user_word_lists(id) ON DELETE CASCADE,
    word_id uuid NOT NULL REFERENCES word_entries(id) ON DELETE CASCADE,
    added_at timestamptz DEFAULT now(),
    PRIMARY KEY (list_id, word_id)
);

CREATE INDEX IF NOT EXISTS user_word_list_items_list_idx
    ON user_word_list_items(list_id, word_id);

-- =============================================================================
-- WORD TRANSLATIONS (shared translations per word entry + target language)
-- =============================================================================

CREATE TABLE IF NOT EXISTS word_entry_translations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    word_entry_id uuid NOT NULL REFERENCES word_entries(id) ON DELETE CASCADE,
    target_lang text NOT NULL,
    provider text NOT NULL DEFAULT 'deepl',
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'ready', 'failed')),
    overlay jsonb,
    source_fingerprint text,
    error_message text,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    UNIQUE (word_entry_id, target_lang, provider)
);

CREATE INDEX IF NOT EXISTS word_entry_translations_lookup_idx
    ON word_entry_translations(word_entry_id, target_lang);

-- =============================================================================
-- USER WORD NOTES (per-user notes per word entry)
-- =============================================================================

CREATE TABLE IF NOT EXISTS user_word_notes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    word_entry_id uuid NOT NULL REFERENCES word_entries(id) ON DELETE CASCADE,
    notes text NOT NULL DEFAULT '',
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    UNIQUE (user_id, word_entry_id)
);

CREATE INDEX IF NOT EXISTS user_word_notes_user_idx
    ON user_word_notes(user_id, word_entry_id);
