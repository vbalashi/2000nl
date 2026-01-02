-- Multi-mode training: enable training both word->definition and definition->word simultaneously
-- Each direction maintains independent FSRS state (already supported by user_word_status unique key)

-- 1. Add columns for enabled modes array and card filter
ALTER TABLE user_settings 
    ADD COLUMN IF NOT EXISTS modes_enabled text[] DEFAULT ARRAY['word-to-definition'],
    ADD COLUMN IF NOT EXISTS card_filter text DEFAULT 'both';

-- Add check constraint for card_filter
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'user_settings_card_filter_check'
    ) THEN
        ALTER TABLE user_settings 
            ADD CONSTRAINT user_settings_card_filter_check 
            CHECK (card_filter IN ('new', 'review', 'both'));
    END IF;
END $$;

-- 2. Migrate existing training_mode to modes_enabled array
UPDATE user_settings 
SET modes_enabled = ARRAY[training_mode]
WHERE training_mode IS NOT NULL 
  AND (modes_enabled IS NULL OR array_length(modes_enabled, 1) IS NULL);

-- 3. Create multi-mode get_next_word function
CREATE OR REPLACE FUNCTION get_next_word(
    p_user_id uuid,
    p_modes text[] DEFAULT ARRAY['word-to-definition'],
    p_exclude_ids uuid[] DEFAULT ARRAY[]::uuid[],
    p_list_id uuid DEFAULT NULL,
    p_list_type text DEFAULT 'curated',
    p_card_filter text DEFAULT 'both'
)
RETURNS SETOF jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_word_id uuid;
    v_selected_mode text;
    v_source text;
    v_overdue_count int;
    v_settings record;
    v_reviews_today int;
    v_new_today int;
    v_list_valid boolean := true;
    v_mode text;
BEGIN
    -- Validate modes array
    IF p_modes IS NULL OR array_length(p_modes, 1) IS NULL THEN
        p_modes := ARRAY['word-to-definition'];
    END IF;

    -- Validate list if provided
    IF p_list_id IS NOT NULL THEN
        IF p_list_type IS NULL THEN
            p_list_type := 'curated';
        END IF;

        IF p_list_type = 'user' THEN
            SELECT EXISTS (
                SELECT 1 FROM user_word_lists
                WHERE id = p_list_id
                  AND user_id = p_user_id
            ) INTO v_list_valid;
        ELSE
            SELECT EXISTS (
                SELECT 1 FROM word_lists
                WHERE id = p_list_id
            ) INTO v_list_valid;
        END IF;

        IF NOT v_list_valid THEN
            RETURN;
        END IF;
    END IF;

    -- Get user settings
    SELECT *
    INTO v_settings
    FROM user_settings
    WHERE user_id = p_user_id;

    v_settings.daily_new_limit := COALESCE(v_settings.daily_new_limit, 10);
    v_settings.daily_review_limit := COALESCE(v_settings.daily_review_limit, 40);

    -- Count reviews and new cards today across all enabled modes
    SELECT COUNT(*) INTO v_reviews_today
    FROM user_review_log
    WHERE user_id = p_user_id
      AND mode = ANY(p_modes)
      AND review_type IN ('review', 'click')
      AND reviewed_at::date = current_date;

    SELECT COUNT(*) INTO v_new_today
    FROM user_review_log
    WHERE user_id = p_user_id
      AND mode = ANY(p_modes)
      AND review_type = 'new'
      AND reviewed_at::date = current_date;

    -- Count overdue across all modes
    SELECT COUNT(*) INTO v_overdue_count
    FROM user_word_status s
    JOIN word_entries w ON w.id = s.word_id
    WHERE s.user_id = p_user_id 
      AND s.mode = ANY(p_modes)
      AND s.next_review_at <= now()
      AND (s.frozen_until IS NULL OR s.frozen_until <= now())
      AND s.hidden = false
      AND s.fsrs_enabled = true
      AND (
            (p_list_id IS NULL AND w.is_nt2_2000 = true)
         OR (p_list_id IS NOT NULL AND p_list_type = 'curated' AND EXISTS (
                SELECT 1 FROM word_list_items li
                WHERE li.list_id = p_list_id
                  AND li.word_id = w.id
            ))
         OR (p_list_id IS NOT NULL AND p_list_type = 'user' AND EXISTS (
                SELECT 1 FROM user_word_list_items li
                JOIN user_word_lists l ON l.id = li.list_id
                WHERE li.list_id = p_list_id
                  AND li.word_id = w.id
                  AND l.user_id = p_user_id
            ))
      );

    -- Priority 1: overdue reviews if quota allows and filter includes reviews
    IF (p_card_filter = 'both' OR p_card_filter = 'review') AND v_reviews_today < v_settings.daily_review_limit THEN
        SELECT s.word_id, s.mode, 'review' INTO v_word_id, v_selected_mode, v_source
        FROM user_word_status s
        JOIN word_entries w ON w.id = s.word_id
        WHERE s.user_id = p_user_id 
          AND s.mode = ANY(p_modes)
          AND s.next_review_at <= now()
          AND (s.frozen_until IS NULL OR s.frozen_until <= now())
          AND s.hidden = false
          AND s.fsrs_enabled = true
          AND NOT (s.word_id = ANY(p_exclude_ids))
          AND (
                (p_list_id IS NULL AND w.is_nt2_2000 = true)
             OR (p_list_id IS NOT NULL AND p_list_type = 'curated' AND EXISTS (
                    SELECT 1 FROM word_list_items li
                    WHERE li.list_id = p_list_id
                      AND li.word_id = w.id
                ))
             OR (p_list_id IS NOT NULL AND p_list_type = 'user' AND EXISTS (
                    SELECT 1 FROM user_word_list_items li
                    JOIN user_word_lists l ON l.id = li.list_id
                    WHERE li.list_id = p_list_id
                      AND li.word_id = w.id
                      AND l.user_id = p_user_id
                ))
          )
        ORDER BY s.next_review_at ASC
        LIMIT 1;
    END IF;

    -- Priority 2: new card if filter includes new and quota allows
    IF v_word_id IS NULL AND (p_card_filter = 'both' OR p_card_filter = 'new') AND v_new_today < v_settings.daily_new_limit THEN
        -- Pick a random mode from enabled modes for new cards
        v_selected_mode := p_modes[1 + floor(random() * array_length(p_modes, 1))::int];
        
        SELECT w.id, 'new' INTO v_word_id, v_source
        FROM word_entries w
        WHERE NOT EXISTS (
                -- Check if word has been seen in ANY of the enabled modes
                SELECT 1 FROM user_word_status s 
                WHERE s.word_id = w.id 
                  AND s.user_id = p_user_id 
                  AND s.mode = v_selected_mode
            )
          AND NOT (w.id = ANY(p_exclude_ids))
          AND (
                (p_list_id IS NULL AND w.is_nt2_2000 = true)
             OR (p_list_id IS NOT NULL AND p_list_type = 'curated' AND EXISTS (
                    SELECT 1 FROM word_list_items li
                    WHERE li.list_id = p_list_id
                      AND li.word_id = w.id
                ))
             OR (p_list_id IS NOT NULL AND p_list_type = 'user' AND EXISTS (
                    SELECT 1 FROM user_word_list_items li
                    JOIN user_word_lists l ON l.id = li.list_id
                    WHERE li.list_id = p_list_id
                      AND li.word_id = w.id
                      AND l.user_id = p_user_id
                ))
          )
        ORDER BY random()
        LIMIT 1;
    END IF;

    -- Priority 3: practice mode fallback
    IF v_word_id IS NULL THEN
        v_selected_mode := p_modes[1 + floor(random() * array_length(p_modes, 1))::int];
        
        SELECT w.id, 'practice' INTO v_word_id, v_source
        FROM word_entries w
        LEFT JOIN user_word_status s
          ON s.word_id = w.id
         AND s.user_id = p_user_id
         AND s.mode = v_selected_mode
        WHERE NOT (w.id = ANY(p_exclude_ids))
          AND (s.hidden IS NULL OR s.hidden = false)
          AND (s.frozen_until IS NULL OR s.frozen_until <= now())
          AND (s.fsrs_enabled IS NULL OR s.fsrs_enabled = true)
          AND (
                (p_list_id IS NULL AND w.is_nt2_2000 = true)
             OR (p_list_id IS NOT NULL AND p_list_type = 'curated' AND EXISTS (
                    SELECT 1 FROM word_list_items li
                    WHERE li.list_id = p_list_id
                      AND li.word_id = w.id
                ))
             OR (p_list_id IS NOT NULL AND p_list_type = 'user' AND EXISTS (
                    SELECT 1 FROM user_word_list_items li
                    JOIN user_word_lists l ON l.id = li.list_id
                    WHERE li.list_id = p_list_id
                      AND li.word_id = w.id
                      AND l.user_id = p_user_id
                ))
          )
        ORDER BY random()
        LIMIT 1;
    END IF;

    IF v_word_id IS NOT NULL THEN
        RETURN QUERY
        SELECT jsonb_build_object(
            'id', w.id,
            'headword', w.headword,
            'part_of_speech', w.part_of_speech,
            'gender', w.gender,
            'raw', w.raw,
            'vandaleId', w.vandale_id,
            'is_nt2_2000', w.is_nt2_2000,
            'mode', v_selected_mode,
            'stats', jsonb_build_object(
                'source', v_source,
                'mode', v_selected_mode,
                'next_review', s.next_review_at,
                'interval', s.fsrs_last_interval,
                'reps', s.fsrs_reps,
                'stability', s.fsrs_stability,
                'difficulty', s.fsrs_difficulty,
                'clicks', s.click_count,
                'overdue_count', v_overdue_count,
                'reason', v_source,
                'reviews_today', v_reviews_today,
                'new_today', v_new_today,
                'daily_new_limit', v_settings.daily_new_limit,
                'daily_review_limit', v_settings.daily_review_limit
            )
        )
        FROM word_entries w
        LEFT JOIN user_word_status s ON s.word_id = w.id AND s.user_id = p_user_id AND s.mode = v_selected_mode
        WHERE w.id = v_word_id;
    END IF;

    RETURN;
END;
$$;

-- 4. Create multi-mode get_training_stats function
CREATE OR REPLACE FUNCTION get_training_stats(
    p_user_id UUID,
    p_modes text[] DEFAULT ARRAY['word-to-definition'],
    p_list_id uuid DEFAULT NULL,
    p_list_type text DEFAULT 'curated'
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    v_today_count INT;
    v_total_success INT;
    v_total_items INT;
BEGIN
    IF p_modes IS NULL OR array_length(p_modes, 1) IS NULL THEN
        p_modes := ARRAY['word-to-definition'];
    END IF;

    IF p_list_id IS NOT NULL AND p_list_type IS NULL THEN
        p_list_type := 'curated';
    END IF;

    -- Count reviews today across all enabled modes
    SELECT COUNT(*) INTO v_today_count
    FROM user_review_log
    WHERE user_id = p_user_id
      AND mode = ANY(p_modes)
      AND reviewed_at::date = current_date;

    -- Count words with FSRS state across all enabled modes
    -- Note: a word counts once even if it has status in multiple modes
    SELECT COUNT(DISTINCT s.word_id) INTO v_total_success
    FROM user_word_status s
    JOIN word_entries w ON w.id = s.word_id
    WHERE s.user_id = p_user_id
      AND s.mode = ANY(p_modes)
      AND s.fsrs_enabled = true
      AND (
            (p_list_id IS NULL AND w.is_nt2_2000 = true)
         OR (p_list_id IS NOT NULL AND p_list_type = 'curated' AND EXISTS (
                SELECT 1 FROM word_list_items li
                WHERE li.list_id = p_list_id
                  AND li.word_id = w.id
            ))
         OR (p_list_id IS NOT NULL AND p_list_type = 'user' AND EXISTS (
                SELECT 1 FROM user_word_list_items li
                JOIN user_word_lists l ON l.id = li.list_id
                WHERE li.list_id = p_list_id
                  AND li.word_id = w.id
                  AND l.user_id = p_user_id
            ))
      );

    -- Count total items in scope
    SELECT COUNT(*) INTO v_total_items
    FROM word_entries w
    WHERE (
            (p_list_id IS NULL AND w.is_nt2_2000 = true)
         OR (p_list_id IS NOT NULL AND p_list_type = 'curated' AND EXISTS (
                SELECT 1 FROM word_list_items li
                WHERE li.list_id = p_list_id
                  AND li.word_id = w.id
            ))
         OR (p_list_id IS NOT NULL AND p_list_type = 'user' AND EXISTS (
                SELECT 1 FROM user_word_list_items li
                JOIN user_word_lists l ON l.id = li.list_id
                WHERE li.list_id = p_list_id
                  AND li.word_id = w.id
                  AND l.user_id = p_user_id
            ))
      );

    RETURN jsonb_build_object(
        'today', v_today_count,
        'totalSuccess', v_total_success,
        'totalItems', v_total_items
    );
END;
$$;

-- 5. Keep backward-compatible overloads for single-mode calls
-- Single mode get_next_word (for backward compatibility)
CREATE OR REPLACE FUNCTION get_next_word(
    p_user_id uuid,
    p_mode text,
    p_exclude_ids uuid[] DEFAULT ARRAY[]::uuid[],
    p_list_id uuid DEFAULT NULL,
    p_list_type text DEFAULT 'curated'
)
RETURNS SETOF jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY SELECT * FROM get_next_word(
        p_user_id,
        ARRAY[p_mode],
        p_exclude_ids,
        p_list_id,
        p_list_type,
        'both'
    );
END;
$$;

-- Single mode get_training_stats (for backward compatibility)
CREATE OR REPLACE FUNCTION get_training_stats(
    p_user_id UUID,
    p_mode TEXT,
    p_list_id uuid DEFAULT NULL,
    p_list_type text DEFAULT 'curated'
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN get_training_stats(
        p_user_id,
        ARRAY[p_mode],
        p_list_id,
        p_list_type
    );
END;
$$;
