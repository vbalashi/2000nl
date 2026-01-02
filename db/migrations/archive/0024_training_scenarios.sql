-- Training Scenarios: aggregation layer above individual card modes
-- Scenarios group related card types (e.g., W->D + D->W = "Understanding")

-- 0. Add active_scenario column to user_settings
ALTER TABLE IF EXISTS user_settings
    ADD COLUMN IF NOT EXISTS active_scenario text DEFAULT 'understanding';

-- 1. Create training_scenarios table
CREATE TABLE IF NOT EXISTS training_scenarios (
    id text PRIMARY KEY,                    -- 'understanding', 'listening', 'conjugation'
    name_en text NOT NULL,                  -- English display name
    name_nl text,                           -- Dutch display name
    description text,                       -- Description of what this scenario trains
    card_modes text[] NOT NULL,             -- Array of mode strings that comprise this scenario
    graduation_threshold numeric DEFAULT 21, -- MIN stability (days) to consider word "learned"
    enabled boolean DEFAULT true,           -- Whether this scenario is available to users
    sort_order int DEFAULT 0                -- Display order
);

-- 2. Seed initial scenarios
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

-- 3. Function: get_scenario_word_stats
-- Returns aggregated stats for a single word within a scenario
CREATE OR REPLACE FUNCTION get_scenario_word_stats(
    p_user_id uuid,
    p_word_id uuid,
    p_scenario_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_card_modes text[];
    v_result jsonb;
BEGIN
    -- Get card modes for this scenario
    SELECT card_modes INTO v_card_modes
    FROM training_scenarios
    WHERE id = p_scenario_id;
    
    IF v_card_modes IS NULL THEN
        RETURN jsonb_build_object('error', 'Scenario not found');
    END IF;
    
    -- Aggregate stats across all cards in the scenario
    SELECT jsonb_build_object(
        'min_stability', MIN(s.fsrs_stability),
        'avg_stability', AVG(s.fsrs_stability),
        'max_stability', MAX(s.fsrs_stability),
        'cards_started', COUNT(s.word_id),
        'cards_total', array_length(v_card_modes, 1),
        'is_learned', COALESCE(MIN(s.fsrs_stability), 0) >= (
            SELECT graduation_threshold FROM training_scenarios WHERE id = p_scenario_id
        )
    ) INTO v_result
    FROM user_word_status s
    WHERE s.user_id = p_user_id
      AND s.word_id = p_word_id
      AND s.mode = ANY(v_card_modes)
      AND s.fsrs_enabled = true
      AND s.hidden = false;
    
    RETURN COALESCE(v_result, jsonb_build_object(
        'min_stability', null,
        'avg_stability', null,
        'max_stability', null,
        'cards_started', 0,
        'cards_total', array_length(v_card_modes, 1),
        'is_learned', false
    ));
END;
$$;

-- 4. Function: get_scenario_stats
-- Returns dashboard-level statistics for a scenario (learned/in_progress/new counts)
CREATE OR REPLACE FUNCTION get_scenario_stats(
    p_user_id uuid,
    p_scenario_id text,
    p_list_id uuid DEFAULT NULL,
    p_list_type text DEFAULT 'curated'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_card_modes text[];
    v_graduation_threshold numeric;
    v_total int;
    v_learned int;
    v_in_progress int;
    v_new int;
BEGIN
    -- Get scenario config
    SELECT card_modes, graduation_threshold 
    INTO v_card_modes, v_graduation_threshold
    FROM training_scenarios
    WHERE id = p_scenario_id;
    
    IF v_card_modes IS NULL THEN
        RETURN jsonb_build_object('error', 'Scenario not found');
    END IF;
    
    -- Count total words in scope
    SELECT COUNT(*) INTO v_total
    FROM word_entries w
    WHERE (
        (p_list_id IS NULL AND w.is_nt2_2000 = true)
        OR (p_list_id IS NOT NULL AND p_list_type = 'curated' AND EXISTS (
            SELECT 1 FROM word_list_items li WHERE li.list_id = p_list_id AND li.word_id = w.id
        ))
        OR (p_list_id IS NOT NULL AND p_list_type = 'user' AND EXISTS (
            SELECT 1 FROM user_word_list_items li
            JOIN user_word_lists l ON l.id = li.list_id
            WHERE li.list_id = p_list_id AND li.word_id = w.id AND l.user_id = p_user_id
        ))
    );
    
    -- Count learned words: MIN(stability) across ALL card modes >= threshold
    -- A word is learned only if ALL cards in the scenario have stability >= threshold
    WITH word_min_stability AS (
        SELECT 
            w.id as word_id,
            MIN(COALESCE(s.fsrs_stability, 0)) as min_stability,
            COUNT(s.word_id) as cards_started
        FROM word_entries w
        LEFT JOIN user_word_status s ON s.word_id = w.id 
            AND s.user_id = p_user_id 
            AND s.mode = ANY(v_card_modes)
            AND s.fsrs_enabled = true
            AND s.hidden = false
        WHERE (
            (p_list_id IS NULL AND w.is_nt2_2000 = true)
            OR (p_list_id IS NOT NULL AND p_list_type = 'curated' AND EXISTS (
                SELECT 1 FROM word_list_items li WHERE li.list_id = p_list_id AND li.word_id = w.id
            ))
            OR (p_list_id IS NOT NULL AND p_list_type = 'user' AND EXISTS (
                SELECT 1 FROM user_word_list_items li
                JOIN user_word_lists l ON l.id = li.list_id
                WHERE li.list_id = p_list_id AND li.word_id = w.id AND l.user_id = p_user_id
            ))
        )
        GROUP BY w.id
    )
    SELECT 
        COUNT(*) FILTER (WHERE min_stability >= v_graduation_threshold AND cards_started >= array_length(v_card_modes, 1)),
        COUNT(*) FILTER (WHERE cards_started > 0 AND (min_stability < v_graduation_threshold OR cards_started < array_length(v_card_modes, 1))),
        COUNT(*) FILTER (WHERE cards_started = 0)
    INTO v_learned, v_in_progress, v_new
    FROM word_min_stability;
    
    RETURN jsonb_build_object(
        'learned', COALESCE(v_learned, 0),
        'in_progress', COALESCE(v_in_progress, 0),
        'new', COALESCE(v_new, 0),
        'total', COALESCE(v_total, 0),
        'scenario_id', p_scenario_id,
        'card_modes', v_card_modes,
        'graduation_threshold', v_graduation_threshold
    );
END;
$$;

-- 5. Update get_next_word to accept optional scenario_id parameter
-- This creates a new overload that looks up modes from the scenario
CREATE OR REPLACE FUNCTION get_next_word(
    p_user_id uuid,
    p_scenario_id text,
    p_exclude_ids uuid[] DEFAULT ARRAY[]::uuid[],
    p_list_id uuid DEFAULT NULL,
    p_list_type text DEFAULT 'curated',
    p_card_filter text DEFAULT 'both',
    p_queue_turn text DEFAULT 'auto'
)
RETURNS SETOF jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_card_modes text[];
BEGIN
    -- Look up card modes from scenario
    SELECT card_modes INTO v_card_modes
    FROM training_scenarios
    WHERE id = p_scenario_id AND enabled = true;
    
    IF v_card_modes IS NULL THEN
        -- Fallback to default if scenario not found
        v_card_modes := ARRAY['word-to-definition'];
    END IF;
    
    -- Delegate to the existing modes-based function
    RETURN QUERY SELECT * FROM get_next_word(
        p_user_id,
        v_card_modes,
        p_exclude_ids,
        p_list_id,
        p_list_type,
        p_card_filter,
        p_queue_turn
    );
END;
$$;

-- 6. Helper function to list available scenarios
CREATE OR REPLACE FUNCTION get_training_scenarios()
RETURNS SETOF jsonb
LANGUAGE sql
SECURITY DEFINER
AS $$
    SELECT jsonb_build_object(
        'id', id,
        'name_en', name_en,
        'name_nl', name_nl,
        'description', description,
        'card_modes', card_modes,
        'graduation_threshold', graduation_threshold,
        'enabled', enabled,
        'sort_order', sort_order
    )
    FROM training_scenarios
    ORDER BY sort_order, id;
$$;
