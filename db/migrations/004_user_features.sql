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
    
    -- Subscription tier (free = 100 word limit, premium/admin = full access)
    subscription_tier text DEFAULT 'free' CHECK (subscription_tier IN ('free', 'premium', 'admin')),
    
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

-- =============================================================================
-- SUBSCRIPTION TIER FUNCTIONS (gated word access for free users)
-- =============================================================================

-- Helper function to get user subscription tier
CREATE OR REPLACE FUNCTION get_user_tier(p_user_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
DECLARE
    v_tier text;
BEGIN
    SELECT COALESCE(subscription_tier, 'free')
    INTO v_tier
    FROM user_settings
    WHERE user_id = p_user_id;
    
    RETURN COALESCE(v_tier, 'free');
END;
$$;

-- Gated word search (global search with 100 word limit for free users)
CREATE OR REPLACE FUNCTION search_word_entries_gated(
    p_query text DEFAULT NULL,
    p_part_of_speech text DEFAULT NULL,
    p_is_nt2 boolean DEFAULT NULL,
    p_filter_frozen boolean DEFAULT NULL,
    p_filter_hidden boolean DEFAULT NULL,
    p_page int DEFAULT 1,
    p_page_size int DEFAULT 20
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
DECLARE
    v_user_id uuid;
    v_tier text;
    v_offset int;
    v_limit int;
    v_total int;
    v_max_allowed int;
    v_is_locked boolean;
    v_items jsonb;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('items', '[]'::jsonb, 'total', 0, 'is_locked', true, 'max_allowed', 0);
    END IF;
    
    v_tier := get_user_tier(v_user_id);
    v_max_allowed := CASE WHEN v_tier IN ('premium', 'admin') THEN NULL ELSE 100 END;
    v_offset := (p_page - 1) * p_page_size;
    v_limit := p_page_size;
    
    SELECT COUNT(*) INTO v_total
    FROM word_entries w
    WHERE (p_query IS NULL OR w.headword ILIKE '%' || p_query || '%')
      AND (p_part_of_speech IS NULL OR w.part_of_speech = p_part_of_speech)
      AND (p_is_nt2 IS NULL OR w.is_nt2_2000 = p_is_nt2)
      AND (p_filter_hidden IS NULL OR p_filter_hidden = false
           OR EXISTS (SELECT 1 FROM user_word_status s WHERE s.user_id = v_user_id AND s.word_id = w.id AND COALESCE(s.hidden, false) = true))
      AND (p_filter_frozen IS NULL OR p_filter_frozen = false
           OR EXISTS (SELECT 1 FROM user_word_status s WHERE s.user_id = v_user_id AND s.word_id = w.id AND s.frozen_until IS NOT NULL AND s.frozen_until > now()));
    
    v_is_locked := v_max_allowed IS NOT NULL AND (v_offset >= v_max_allowed);
    
    IF v_is_locked THEN
        RETURN jsonb_build_object('items', '[]'::jsonb, 'total', v_total, 'is_locked', true, 'max_allowed', v_max_allowed);
    END IF;
    
    IF v_max_allowed IS NOT NULL AND (v_offset + v_limit) > v_max_allowed THEN
        v_limit := v_max_allowed - v_offset;
    END IF;
    
    SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb), '[]'::jsonb) INTO v_items
    FROM (
        SELECT w.id, w.headword, w.part_of_speech, w.gender, w.raw, w.is_nt2_2000
        FROM word_entries w
        WHERE (p_query IS NULL OR w.headword ILIKE '%' || p_query || '%')
          AND (p_part_of_speech IS NULL OR w.part_of_speech = p_part_of_speech)
          AND (p_is_nt2 IS NULL OR w.is_nt2_2000 = p_is_nt2)
          AND (p_filter_hidden IS NULL OR p_filter_hidden = false
               OR EXISTS (SELECT 1 FROM user_word_status s WHERE s.user_id = v_user_id AND s.word_id = w.id AND COALESCE(s.hidden, false) = true))
          AND (p_filter_frozen IS NULL OR p_filter_frozen = false
               OR EXISTS (SELECT 1 FROM user_word_status s WHERE s.user_id = v_user_id AND s.word_id = w.id AND s.frozen_until IS NOT NULL AND s.frozen_until > now()))
        ORDER BY w.headword ASC
        OFFSET v_offset LIMIT v_limit
    ) t;
    
    RETURN jsonb_build_object(
        'items', v_items,
        'total', v_total,
        'is_locked', v_max_allowed IS NOT NULL AND v_total > v_max_allowed,
        'max_allowed', v_max_allowed
    );
END;
$$;

-- Gated fetch for curated/user lists (100 word limit by rank for free users)
CREATE OR REPLACE FUNCTION fetch_words_for_list_gated(
    p_list_id uuid,
    p_list_type text DEFAULT 'curated',
    p_query text DEFAULT NULL,
    p_part_of_speech text DEFAULT NULL,
    p_is_nt2 boolean DEFAULT NULL,
    p_filter_frozen boolean DEFAULT NULL,
    p_filter_hidden boolean DEFAULT NULL,
    p_page int DEFAULT 1,
    p_page_size int DEFAULT 20
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
DECLARE
    v_user_id uuid;
    v_tier text;
    v_offset int;
    v_limit int;
    v_total int;
    v_max_allowed int;
    v_is_locked boolean;
    v_items jsonb;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('items', '[]'::jsonb, 'total', 0, 'is_locked', true, 'max_allowed', 0);
    END IF;
    
    v_tier := get_user_tier(v_user_id);
    v_max_allowed := CASE WHEN v_tier IN ('premium', 'admin') THEN NULL ELSE 100 END;
    v_offset := (p_page - 1) * p_page_size;
    v_limit := p_page_size;
    
    IF p_list_type = 'curated' THEN
        SELECT COUNT(*) INTO v_total
        FROM word_entries w
        JOIN word_list_items li ON li.word_id = w.id
        WHERE li.list_id = p_list_id
          AND (p_query IS NULL OR w.headword ILIKE '%' || p_query || '%')
          AND (p_part_of_speech IS NULL OR w.part_of_speech = p_part_of_speech)
          AND (p_is_nt2 IS NULL OR w.is_nt2_2000 = p_is_nt2)
          AND (p_filter_hidden IS NULL OR p_filter_hidden = false
               OR EXISTS (SELECT 1 FROM user_word_status s WHERE s.user_id = v_user_id AND s.word_id = w.id AND COALESCE(s.hidden, false) = true))
          AND (p_filter_frozen IS NULL OR p_filter_frozen = false
               OR EXISTS (SELECT 1 FROM user_word_status s WHERE s.user_id = v_user_id AND s.word_id = w.id AND s.frozen_until IS NOT NULL AND s.frozen_until > now()));
    ELSE
        IF NOT EXISTS (SELECT 1 FROM user_word_lists WHERE id = p_list_id AND user_id = v_user_id) THEN
            RETURN jsonb_build_object('items', '[]'::jsonb, 'total', 0, 'is_locked', false, 'max_allowed', v_max_allowed);
        END IF;
        
        SELECT COUNT(*) INTO v_total
        FROM word_entries w
        JOIN user_word_list_items li ON li.word_id = w.id
        WHERE li.list_id = p_list_id
          AND (p_query IS NULL OR w.headword ILIKE '%' || p_query || '%')
          AND (p_part_of_speech IS NULL OR w.part_of_speech = p_part_of_speech)
          AND (p_is_nt2 IS NULL OR w.is_nt2_2000 = p_is_nt2)
          AND (p_filter_hidden IS NULL OR p_filter_hidden = false
               OR EXISTS (SELECT 1 FROM user_word_status s WHERE s.user_id = v_user_id AND s.word_id = w.id AND COALESCE(s.hidden, false) = true))
          AND (p_filter_frozen IS NULL OR p_filter_frozen = false
               OR EXISTS (SELECT 1 FROM user_word_status s WHERE s.user_id = v_user_id AND s.word_id = w.id AND s.frozen_until IS NOT NULL AND s.frozen_until > now()));
    END IF;
    
    v_is_locked := v_max_allowed IS NOT NULL AND (v_offset >= v_max_allowed);
    
    IF v_is_locked THEN
        RETURN jsonb_build_object('items', '[]'::jsonb, 'total', v_total, 'is_locked', true, 'max_allowed', v_max_allowed);
    END IF;
    
    IF v_max_allowed IS NOT NULL AND (v_offset + v_limit) > v_max_allowed THEN
        v_limit := v_max_allowed - v_offset;
    END IF;
    
    IF p_list_type = 'curated' THEN
        SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb ORDER BY t.sort_rank, t.headword), '[]'::jsonb) INTO v_items
        FROM (
            SELECT w.id, w.headword, w.part_of_speech, w.gender, w.raw, w.is_nt2_2000, COALESCE(li.rank, 999999) AS sort_rank
            FROM word_entries w
            JOIN word_list_items li ON li.word_id = w.id
            WHERE li.list_id = p_list_id
              AND (p_query IS NULL OR w.headword ILIKE '%' || p_query || '%')
              AND (p_part_of_speech IS NULL OR w.part_of_speech = p_part_of_speech)
              AND (p_is_nt2 IS NULL OR w.is_nt2_2000 = p_is_nt2)
              AND (p_filter_hidden IS NULL OR p_filter_hidden = false
                   OR EXISTS (SELECT 1 FROM user_word_status s WHERE s.user_id = v_user_id AND s.word_id = w.id AND COALESCE(s.hidden, false) = true))
              AND (p_filter_frozen IS NULL OR p_filter_frozen = false
                   OR EXISTS (SELECT 1 FROM user_word_status s WHERE s.user_id = v_user_id AND s.word_id = w.id AND s.frozen_until IS NOT NULL AND s.frozen_until > now()))
            ORDER BY COALESCE(li.rank, 999999) ASC, w.headword ASC
            OFFSET v_offset LIMIT v_limit
        ) t;
    ELSE
        SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb), '[]'::jsonb) INTO v_items
        FROM (
            SELECT w.id, w.headword, w.part_of_speech, w.gender, w.raw, w.is_nt2_2000
            FROM word_entries w
            JOIN user_word_list_items li ON li.word_id = w.id
            WHERE li.list_id = p_list_id
              AND (p_query IS NULL OR w.headword ILIKE '%' || p_query || '%')
              AND (p_part_of_speech IS NULL OR w.part_of_speech = p_part_of_speech)
              AND (p_is_nt2 IS NULL OR w.is_nt2_2000 = p_is_nt2)
              AND (p_filter_hidden IS NULL OR p_filter_hidden = false
                   OR EXISTS (SELECT 1 FROM user_word_status s WHERE s.user_id = v_user_id AND s.word_id = w.id AND COALESCE(s.hidden, false) = true))
              AND (p_filter_frozen IS NULL OR p_filter_frozen = false
                   OR EXISTS (SELECT 1 FROM user_word_status s WHERE s.user_id = v_user_id AND s.word_id = w.id AND s.frozen_until IS NOT NULL AND s.frozen_until > now()))
            ORDER BY li.added_at DESC, w.headword ASC
            OFFSET v_offset LIMIT v_limit
        ) t;
    END IF;
    
    RETURN jsonb_build_object(
        'items', v_items,
        'total', v_total,
        'is_locked', v_max_allowed IS NOT NULL AND v_total > v_max_allowed,
        'max_allowed', v_max_allowed
    );
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION get_user_tier(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION search_word_entries_gated(text, text, boolean, boolean, boolean, int, int) TO authenticated;
GRANT EXECUTE ON FUNCTION fetch_words_for_list_gated(uuid, text, text, text, boolean, boolean, boolean, int, int) TO authenticated;
