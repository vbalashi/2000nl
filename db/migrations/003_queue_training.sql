-- Queue System & Training Functions
-- Generated: 2025-12-31
-- This file contains card selection (get_next_word) and statistics functions.

-- =============================================================================
-- GET NEXT WORD (main queue-based card selector)
-- =============================================================================

CREATE OR REPLACE FUNCTION get_next_word(
    p_user_id uuid,
    p_modes text[] DEFAULT ARRAY['word-to-definition'],
    p_exclude_ids uuid[] DEFAULT ARRAY[]::uuid[],
    p_list_id uuid DEFAULT NULL,
    p_list_type text DEFAULT 'curated',
    p_card_filter text DEFAULT 'both',
    p_queue_turn text DEFAULT 'auto'  -- 'new' | 'review' | 'auto'
)
RETURNS SETOF jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_word_id uuid;
    v_selected_mode text;
    v_source text;
    v_settings record;
    v_new_today int;
    v_list_valid boolean := true;
    v_new_pool_size int;
    v_review_pool_size int;
    v_learning_due_count int;
    v_review_pool_limit int := 10;
BEGIN
    -- AUTH CHECK: Verify caller owns this user_id
    IF p_user_id != (select auth.uid()) THEN
        RAISE EXCEPTION 'unauthorized: user_id does not match authenticated user';
    END IF;

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
                WHERE id = p_list_id AND user_id = p_user_id
            ) INTO v_list_valid;
        ELSE
            SELECT EXISTS (
                SELECT 1 FROM word_lists WHERE id = p_list_id
            ) INTO v_list_valid;
        END IF;

        IF NOT v_list_valid THEN
            RETURN;
        END IF;
    END IF;

    -- Get user settings
    SELECT * INTO v_settings
    FROM user_settings
    WHERE user_id = p_user_id;

    v_settings.daily_new_limit := COALESCE(v_settings.daily_new_limit, 10);

    -- Count new cards introduced today
    SELECT COUNT(DISTINCT word_id) INTO v_new_today
    FROM user_review_log
    WHERE user_id = p_user_id
      AND mode = ANY(p_modes)
      AND review_type = 'new'
      AND reviewed_at::date = current_date;

    -- Count learning cards due
    SELECT COUNT(*) INTO v_learning_due_count
    FROM user_word_status s
    JOIN word_entries w ON w.id = s.word_id
    WHERE s.user_id = p_user_id 
      AND s.mode = ANY(p_modes)
      AND COALESCE(s.fsrs_last_interval, 0) < 1.0
      AND s.next_review_at <= now()
      AND (s.frozen_until IS NULL OR s.frozen_until <= now())
      AND s.hidden = false
      AND s.fsrs_enabled = true
      AND NOT (s.word_id = ANY(p_exclude_ids))
      AND (
            (p_list_id IS NULL AND w.is_nt2_2000 = true)
         OR (p_list_id IS NOT NULL AND p_list_type = 'curated' AND EXISTS (
                SELECT 1 FROM word_list_items li
                WHERE li.list_id = p_list_id AND li.word_id = w.id
            ))
         OR (p_list_id IS NOT NULL AND p_list_type = 'user' AND EXISTS (
                SELECT 1 FROM user_word_list_items li
                JOIN user_word_lists l ON l.id = li.list_id
                WHERE li.list_id = p_list_id AND li.word_id = w.id AND l.user_id = p_user_id
            ))
      );

    -- Count unseen words available
    SELECT COUNT(*) INTO v_new_pool_size
    FROM word_entries w
    WHERE NOT EXISTS (
            SELECT 1 FROM user_word_status s 
            WHERE s.word_id = w.id 
              AND s.user_id = p_user_id 
              AND s.mode = ANY(p_modes)
        )
      AND NOT (w.id = ANY(p_exclude_ids))
      AND (
            (p_list_id IS NULL AND w.is_nt2_2000 = true)
         OR (p_list_id IS NOT NULL AND p_list_type = 'curated' AND EXISTS (
                SELECT 1 FROM word_list_items li
                WHERE li.list_id = p_list_id AND li.word_id = w.id
            ))
         OR (p_list_id IS NOT NULL AND p_list_type = 'user' AND EXISTS (
                SELECT 1 FROM user_word_list_items li
                JOIN user_word_lists l ON l.id = li.list_id
                WHERE li.list_id = p_list_id AND li.word_id = w.id AND l.user_id = p_user_id
            ))
      );

    -- Count graduated reviews due now
    SELECT COUNT(*) INTO v_review_pool_size
    FROM user_word_status s
    JOIN word_entries w ON w.id = s.word_id
    WHERE s.user_id = p_user_id 
      AND s.mode = ANY(p_modes)
      AND s.fsrs_last_interval >= 1.0
      AND s.next_review_at <= now()
      AND (s.frozen_until IS NULL OR s.frozen_until <= now())
      AND s.hidden = false
      AND s.fsrs_enabled = true
      AND NOT (s.word_id = ANY(p_exclude_ids))
      AND (
            (p_list_id IS NULL AND w.is_nt2_2000 = true)
         OR (p_list_id IS NOT NULL AND p_list_type = 'curated' AND EXISTS (
                SELECT 1 FROM word_list_items li
                WHERE li.list_id = p_list_id AND li.word_id = w.id
            ))
         OR (p_list_id IS NOT NULL AND p_list_type = 'user' AND EXISTS (
                SELECT 1 FROM user_word_list_items li
                JOIN user_word_lists l ON l.id = li.list_id
                WHERE li.list_id = p_list_id AND li.word_id = w.id AND l.user_id = p_user_id
            ))
      );

    -- =========================================================================
    -- Priority A: Explicit queueTurn='new' (interleave cycle requests new card)
    -- =========================================================================
    IF p_queue_turn = 'new' AND p_card_filter != 'review' THEN
        IF v_new_today < v_settings.daily_new_limit THEN
            v_selected_mode := p_modes[1 + floor(random() * array_length(p_modes, 1))::int];
            
            SELECT w.id, 'new' INTO v_word_id, v_source
            FROM word_entries w
            WHERE NOT EXISTS (
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
                        WHERE li.list_id = p_list_id AND li.word_id = w.id
                    ))
                 OR (p_list_id IS NOT NULL AND p_list_type = 'user' AND EXISTS (
                        SELECT 1 FROM user_word_list_items li
                        JOIN user_word_lists l ON l.id = li.list_id
                        WHERE li.list_id = p_list_id AND li.word_id = w.id AND l.user_id = p_user_id
                    ))
              )
            ORDER BY random()
            LIMIT 1;
        END IF;
        
        -- Fallback to learning if no new card available
        IF v_word_id IS NULL AND v_learning_due_count > 0 THEN
            SELECT s.word_id, s.mode, 'learning' INTO v_word_id, v_selected_mode, v_source
            FROM user_word_status s
            JOIN word_entries w ON w.id = s.word_id
            WHERE s.user_id = p_user_id 
              AND s.mode = ANY(p_modes)
              AND COALESCE(s.fsrs_last_interval, 0) < 1.0
              AND s.next_review_at <= now()
              AND (s.frozen_until IS NULL OR s.frozen_until <= now())
              AND s.hidden = false
              AND s.fsrs_enabled = true
              AND NOT (s.word_id = ANY(p_exclude_ids))
              AND (
                    (p_list_id IS NULL AND w.is_nt2_2000 = true)
                 OR (p_list_id IS NOT NULL AND p_list_type = 'curated' AND EXISTS (
                        SELECT 1 FROM word_list_items li
                        WHERE li.list_id = p_list_id AND li.word_id = w.id
                    ))
                 OR (p_list_id IS NOT NULL AND p_list_type = 'user' AND EXISTS (
                        SELECT 1 FROM user_word_list_items li
                        JOIN user_word_lists l ON l.id = li.list_id
                        WHERE li.list_id = p_list_id AND li.word_id = w.id AND l.user_id = p_user_id
                    ))
              )
            ORDER BY s.next_review_at ASC
            LIMIT 1;
        END IF;
    END IF;

    -- =========================================================================
    -- Priority B: card_filter='new' (user wants ONLY new cards)
    -- =========================================================================
    IF v_word_id IS NULL AND p_card_filter = 'new' THEN
        IF v_new_today < v_settings.daily_new_limit THEN
            v_selected_mode := p_modes[1 + floor(random() * array_length(p_modes, 1))::int];
            
            SELECT w.id, 'new' INTO v_word_id, v_source
            FROM word_entries w
            WHERE NOT EXISTS (
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
                        WHERE li.list_id = p_list_id AND li.word_id = w.id
                    ))
                 OR (p_list_id IS NOT NULL AND p_list_type = 'user' AND EXISTS (
                        SELECT 1 FROM user_word_list_items li
                        JOIN user_word_lists l ON l.id = li.list_id
                        WHERE li.list_id = p_list_id AND li.word_id = w.id AND l.user_id = p_user_id
                    ))
              )
            ORDER BY random()
            LIMIT 1;
        END IF;
    END IF;

    -- =========================================================================
    -- Priority C: queueTurn='review' OR card_filter='review'
    -- =========================================================================
    IF v_word_id IS NULL AND (p_queue_turn = 'review' OR p_card_filter = 'review') AND p_card_filter != 'new' THEN
        -- C1: Due reviews first
        SELECT s.word_id, s.mode, 'review' INTO v_word_id, v_selected_mode, v_source
        FROM user_word_status s
        JOIN word_entries w ON w.id = s.word_id
        WHERE s.user_id = p_user_id 
          AND s.mode = ANY(p_modes)
          AND s.fsrs_last_interval >= 1.0
          AND s.next_review_at <= now()
          AND (s.frozen_until IS NULL OR s.frozen_until <= now())
          AND s.hidden = false
          AND s.fsrs_enabled = true
          AND NOT (s.word_id = ANY(p_exclude_ids))
          AND (
                (p_list_id IS NULL AND w.is_nt2_2000 = true)
             OR (p_list_id IS NOT NULL AND p_list_type = 'curated' AND EXISTS (
                    SELECT 1 FROM word_list_items li
                    WHERE li.list_id = p_list_id AND li.word_id = w.id
                ))
             OR (p_list_id IS NOT NULL AND p_list_type = 'user' AND EXISTS (
                    SELECT 1 FROM user_word_list_items li
                    JOIN user_word_lists l ON l.id = li.list_id
                    WHERE li.list_id = p_list_id AND li.word_id = w.id AND l.user_id = p_user_id
                ))
          )
        ORDER BY s.next_review_at ASC
        LIMIT 1;
        
        -- C2: Try learning if card_filter='both'
        IF v_word_id IS NULL AND p_card_filter = 'both' AND v_learning_due_count > 0 THEN
            SELECT s.word_id, s.mode, 'learning' INTO v_word_id, v_selected_mode, v_source
            FROM user_word_status s
            JOIN word_entries w ON w.id = s.word_id
            WHERE s.user_id = p_user_id 
              AND s.mode = ANY(p_modes)
              AND COALESCE(s.fsrs_last_interval, 0) < 1.0
              AND s.next_review_at <= now()
              AND (s.frozen_until IS NULL OR s.frozen_until <= now())
              AND s.hidden = false
              AND s.fsrs_enabled = true
              AND NOT (s.word_id = ANY(p_exclude_ids))
              AND (
                    (p_list_id IS NULL AND w.is_nt2_2000 = true)
                 OR (p_list_id IS NOT NULL AND p_list_type = 'curated' AND EXISTS (
                        SELECT 1 FROM word_list_items li
                        WHERE li.list_id = p_list_id AND li.word_id = w.id
                    ))
                 OR (p_list_id IS NOT NULL AND p_list_type = 'user' AND EXISTS (
                        SELECT 1 FROM user_word_list_items li
                        JOIN user_word_lists l ON l.id = li.list_id
                        WHERE li.list_id = p_list_id AND li.word_id = w.id AND l.user_id = p_user_id
                    ))
              )
            ORDER BY s.next_review_at ASC
            LIMIT 1;
        END IF;
        
        -- C3: Try new if card_filter='both'
        IF v_word_id IS NULL AND p_card_filter = 'both' AND v_new_today < v_settings.daily_new_limit THEN
            v_selected_mode := p_modes[1 + floor(random() * array_length(p_modes, 1))::int];
            
            SELECT w.id, 'new' INTO v_word_id, v_source
            FROM word_entries w
            WHERE NOT EXISTS (
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
                        WHERE li.list_id = p_list_id AND li.word_id = w.id
                    ))
                 OR (p_list_id IS NOT NULL AND p_list_type = 'user' AND EXISTS (
                        SELECT 1 FROM user_word_list_items li
                        JOIN user_word_lists l ON l.id = li.list_id
                        WHERE li.list_id = p_list_id AND li.word_id = w.id AND l.user_id = p_user_id
                    ))
              )
            ORDER BY random()
            LIMIT 1;
        END IF;
    END IF;

    -- =========================================================================
    -- Priority D: Auto mode (queueTurn='auto' with card_filter='both')
    -- =========================================================================
    IF v_word_id IS NULL AND p_queue_turn = 'auto' AND p_card_filter = 'both' THEN
        -- D1: Due reviews first
        SELECT s.word_id, s.mode, 'review' INTO v_word_id, v_selected_mode, v_source
        FROM user_word_status s
        JOIN word_entries w ON w.id = s.word_id
        WHERE s.user_id = p_user_id 
          AND s.mode = ANY(p_modes)
          AND s.fsrs_last_interval >= 1.0
          AND s.next_review_at <= now()
          AND (s.frozen_until IS NULL OR s.frozen_until <= now())
          AND s.hidden = false
          AND s.fsrs_enabled = true
          AND NOT (s.word_id = ANY(p_exclude_ids))
          AND (
                (p_list_id IS NULL AND w.is_nt2_2000 = true)
             OR (p_list_id IS NOT NULL AND p_list_type = 'curated' AND EXISTS (
                    SELECT 1 FROM word_list_items li
                    WHERE li.list_id = p_list_id AND li.word_id = w.id
                ))
             OR (p_list_id IS NOT NULL AND p_list_type = 'user' AND EXISTS (
                    SELECT 1 FROM user_word_list_items li
                    JOIN user_word_lists l ON l.id = li.list_id
                    WHERE li.list_id = p_list_id AND li.word_id = w.id AND l.user_id = p_user_id
                ))
          )
        ORDER BY s.next_review_at ASC
        LIMIT 1;

        -- D2: Learning due
        IF v_word_id IS NULL AND v_learning_due_count > 0 THEN
            SELECT s.word_id, s.mode, 'learning' INTO v_word_id, v_selected_mode, v_source
            FROM user_word_status s
            JOIN word_entries w ON w.id = s.word_id
            WHERE s.user_id = p_user_id 
              AND s.mode = ANY(p_modes)
              AND COALESCE(s.fsrs_last_interval, 0) < 1.0
              AND s.next_review_at <= now()
              AND (s.frozen_until IS NULL OR s.frozen_until <= now())
              AND s.hidden = false
              AND s.fsrs_enabled = true
              AND NOT (s.word_id = ANY(p_exclude_ids))
              AND (
                    (p_list_id IS NULL AND w.is_nt2_2000 = true)
                 OR (p_list_id IS NOT NULL AND p_list_type = 'curated' AND EXISTS (
                        SELECT 1 FROM word_list_items li
                        WHERE li.list_id = p_list_id AND li.word_id = w.id
                    ))
                 OR (p_list_id IS NOT NULL AND p_list_type = 'user' AND EXISTS (
                        SELECT 1 FROM user_word_list_items li
                        JOIN user_word_lists l ON l.id = li.list_id
                        WHERE li.list_id = p_list_id AND li.word_id = w.id AND l.user_id = p_user_id
                    ))
              )
            ORDER BY s.next_review_at ASC
            LIMIT 1;
        END IF;

        -- D3: New card if quota allows
        IF v_word_id IS NULL AND v_new_today < v_settings.daily_new_limit THEN
            v_selected_mode := p_modes[1 + floor(random() * array_length(p_modes, 1))::int];
            
            SELECT w.id, 'new' INTO v_word_id, v_source
            FROM word_entries w
            WHERE NOT EXISTS (
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
                        WHERE li.list_id = p_list_id AND li.word_id = w.id
                    ))
                 OR (p_list_id IS NOT NULL AND p_list_type = 'user' AND EXISTS (
                        SELECT 1 FROM user_word_list_items li
                        JOIN user_word_lists l ON l.id = li.list_id
                        WHERE li.list_id = p_list_id AND li.word_id = w.id AND l.user_id = p_user_id
                    ))
              )
            ORDER BY random()
            LIMIT 1;
        END IF;
    END IF;

    -- =========================================================================
    -- Fallback E: Future-due review practice
    -- =========================================================================
    IF v_word_id IS NULL AND p_card_filter != 'new' THEN
        SELECT s.word_id, s.mode, 'review' INTO v_word_id, v_selected_mode, v_source
        FROM user_word_status s
        JOIN word_entries w ON w.id = s.word_id
        WHERE s.user_id = p_user_id 
          AND s.mode = ANY(p_modes)
          AND s.fsrs_last_interval >= 1.0
          AND (s.frozen_until IS NULL OR s.frozen_until <= now())
          AND s.hidden = false
          AND s.fsrs_enabled = true
          AND NOT (s.word_id = ANY(p_exclude_ids))
          AND (
                (p_list_id IS NULL AND w.is_nt2_2000 = true)
             OR (p_list_id IS NOT NULL AND p_list_type = 'curated' AND EXISTS (
                    SELECT 1 FROM word_list_items li
                    WHERE li.list_id = p_list_id AND li.word_id = w.id
                ))
             OR (p_list_id IS NOT NULL AND p_list_type = 'user' AND EXISTS (
                    SELECT 1 FROM user_word_list_items li
                    JOIN user_word_lists l ON l.id = li.list_id
                    WHERE li.list_id = p_list_id AND li.word_id = w.id AND l.user_id = p_user_id
                ))
          )
        ORDER BY s.next_review_at ASC
        LIMIT 1;
    END IF;

    -- =========================================================================
    -- Fallback F: Practice mode - any word from pool
    -- =========================================================================
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
                    WHERE li.list_id = p_list_id AND li.word_id = w.id
                ))
             OR (p_list_id IS NOT NULL AND p_list_type = 'user' AND EXISTS (
                    SELECT 1 FROM user_word_list_items li
                    JOIN user_word_lists l ON l.id = li.list_id
                    WHERE li.list_id = p_list_id AND li.word_id = w.id AND l.user_id = p_user_id
                ))
          )
        ORDER BY random()
        LIMIT 1;
    END IF;

    -- Return result
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
            'meanings_count', (
                SELECT COUNT(*) FROM word_entries we 
                WHERE we.headword = w.headword
            ),
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
                'new_today', v_new_today,
                'daily_new_limit', v_settings.daily_new_limit,
                'new_pool_size', v_new_pool_size,
                'learning_due_count', v_learning_due_count,
                'review_pool_size', LEAST(v_review_pool_size, v_review_pool_limit),
                'reason', v_source
            )
        )
        FROM word_entries w
        LEFT JOIN user_word_status s ON s.word_id = w.id AND s.user_id = p_user_id AND s.mode = v_selected_mode
        WHERE w.id = v_word_id;
    END IF;

    RETURN;
END;
$$;

-- =============================================================================
-- GET NEXT WORD OVERLOADS
-- =============================================================================

-- Single mode overload (backward compat)
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
    -- AUTH CHECK: Verify caller owns this user_id
    IF p_user_id != (select auth.uid()) THEN
        RAISE EXCEPTION 'unauthorized: user_id does not match authenticated user';
    END IF;

    RETURN QUERY SELECT * FROM get_next_word(
        p_user_id, ARRAY[p_mode], p_exclude_ids, p_list_id, p_list_type, 'both', 'auto'
    );
END;
$$;

-- Scenario-based overload REMOVED due to signature ambiguity with single-mode overload.
-- Both had (uuid, text, uuid[]) as first 3 params, causing Postgres function resolution errors.
-- If needed, re-add with different signature (e.g., different param order or types).

-- =============================================================================
-- TRAINING STATS
-- =============================================================================

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

    SELECT COUNT(*) INTO v_today_count
    FROM user_review_log
    WHERE user_id = p_user_id
      AND mode = ANY(p_modes)
      AND reviewed_at::date = current_date;

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
                WHERE li.list_id = p_list_id AND li.word_id = w.id
            ))
         OR (p_list_id IS NOT NULL AND p_list_type = 'user' AND EXISTS (
                SELECT 1 FROM user_word_list_items li
                JOIN user_word_lists l ON l.id = li.list_id
                WHERE li.list_id = p_list_id AND li.word_id = w.id AND l.user_id = p_user_id
            ))
      );

    SELECT COUNT(*) INTO v_total_items
    FROM word_entries w
    WHERE (
            (p_list_id IS NULL AND w.is_nt2_2000 = true)
         OR (p_list_id IS NOT NULL AND p_list_type = 'curated' AND EXISTS (
                SELECT 1 FROM word_list_items li
                WHERE li.list_id = p_list_id AND li.word_id = w.id
            ))
         OR (p_list_id IS NOT NULL AND p_list_type = 'user' AND EXISTS (
                SELECT 1 FROM user_word_list_items li
                JOIN user_word_lists l ON l.id = li.list_id
                WHERE li.list_id = p_list_id AND li.word_id = w.id AND l.user_id = p_user_id
            ))
      );

    RETURN jsonb_build_object(
        'today', v_today_count,
        'totalSuccess', v_total_success,
        'totalItems', v_total_items
    );
END;
$$;

-- Single mode overload
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
    RETURN get_training_stats(p_user_id, ARRAY[p_mode], p_list_id, p_list_type);
END;
$$;

-- =============================================================================
-- DETAILED TRAINING STATS
-- =============================================================================

CREATE OR REPLACE FUNCTION get_detailed_training_stats(
    p_user_id UUID,
    p_modes text[] DEFAULT ARRAY['word-to-definition'],
    p_list_id uuid DEFAULT NULL,
    p_list_type text DEFAULT 'curated'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_new_words_today INT;
    v_new_cards_today INT;
    v_daily_new_limit INT;
    v_review_words_done INT;
    v_review_cards_done INT;
    v_review_words_due INT;
    v_review_cards_due INT;
    v_total_words_learned INT;
    v_total_words_in_list INT;
BEGIN
    -- AUTH CHECK: Verify caller owns this user_id
    IF p_user_id != (select auth.uid()) THEN
        RAISE EXCEPTION 'unauthorized: user_id does not match authenticated user';
    END IF;

    IF p_modes IS NULL OR array_length(p_modes, 1) IS NULL THEN
        p_modes := ARRAY['word-to-definition'];
    END IF;

    IF p_list_id IS NOT NULL AND p_list_type IS NULL THEN
        p_list_type := 'curated';
    END IF;

    SELECT COALESCE(daily_new_limit, 10) INTO v_daily_new_limit
    FROM user_settings WHERE user_id = p_user_id;
    v_daily_new_limit := COALESCE(v_daily_new_limit, 10);

    -- New words introduced today that have graduated
    SELECT COUNT(DISTINCT rl.word_id) INTO v_new_words_today
    FROM user_review_log rl
    JOIN user_word_status s ON s.word_id = rl.word_id 
        AND s.user_id = rl.user_id 
        AND s.mode = rl.mode
    WHERE rl.user_id = p_user_id
      AND rl.mode = ANY(p_modes)
      AND rl.review_type = 'new'
      AND rl.reviewed_at::date = current_date
      AND s.fsrs_last_interval >= 1.0;

    v_new_cards_today := v_new_words_today;

    -- Review cards done today
    SELECT COUNT(DISTINCT word_id) INTO v_review_words_done
    FROM user_review_log
    WHERE user_id = p_user_id
      AND mode = ANY(p_modes)
      AND review_type = 'review'
      AND reviewed_at::date = current_date
      AND interval_after >= 1.0;

    SELECT COUNT(*) INTO v_review_cards_done
    FROM user_review_log
    WHERE user_id = p_user_id
      AND mode = ANY(p_modes)
      AND review_type = 'review'
      AND reviewed_at::date = current_date
      AND interval_after >= 1.0;

    -- Review cards due today (excluding new cards introduced today)
    SELECT COUNT(DISTINCT s.word_id) INTO v_review_words_due
    FROM user_word_status s
    JOIN word_entries w ON w.id = s.word_id
    WHERE s.user_id = p_user_id
      AND s.mode = ANY(p_modes)
      AND s.next_review_at < (current_date + interval '1 day')
      AND (s.frozen_until IS NULL OR s.frozen_until <= now())
      AND s.hidden = false
      AND s.fsrs_enabled = true
      AND NOT EXISTS (
          SELECT 1 FROM user_review_log rl
          WHERE rl.user_id = s.user_id
            AND rl.word_id = s.word_id
            AND rl.mode = s.mode
            AND rl.review_type = 'new'
            AND rl.reviewed_at::date = current_date
      )
      AND (
            (p_list_id IS NULL AND w.is_nt2_2000 = true)
         OR (p_list_id IS NOT NULL AND p_list_type = 'curated' AND EXISTS (
                SELECT 1 FROM word_list_items li
                WHERE li.list_id = p_list_id AND li.word_id = w.id
            ))
         OR (p_list_id IS NOT NULL AND p_list_type = 'user' AND EXISTS (
                SELECT 1 FROM user_word_list_items li
                JOIN user_word_lists l ON l.id = li.list_id
                WHERE li.list_id = p_list_id AND li.word_id = w.id AND l.user_id = p_user_id
            ))
      );

    SELECT COUNT(*) INTO v_review_cards_due
    FROM user_word_status s
    JOIN word_entries w ON w.id = s.word_id
    WHERE s.user_id = p_user_id
      AND s.mode = ANY(p_modes)
      AND s.next_review_at < (current_date + interval '1 day')
      AND (s.frozen_until IS NULL OR s.frozen_until <= now())
      AND s.hidden = false
      AND s.fsrs_enabled = true
      AND NOT EXISTS (
          SELECT 1 FROM user_review_log rl
          WHERE rl.user_id = s.user_id
            AND rl.word_id = s.word_id
            AND rl.mode = s.mode
            AND rl.review_type = 'new'
            AND rl.reviewed_at::date = current_date
      )
      AND (
            (p_list_id IS NULL AND w.is_nt2_2000 = true)
         OR (p_list_id IS NOT NULL AND p_list_type = 'curated' AND EXISTS (
                SELECT 1 FROM word_list_items li
                WHERE li.list_id = p_list_id AND li.word_id = w.id
            ))
         OR (p_list_id IS NOT NULL AND p_list_type = 'user' AND EXISTS (
                SELECT 1 FROM user_word_list_items li
                JOIN user_word_lists l ON l.id = li.list_id
                WHERE li.list_id = p_list_id AND li.word_id = w.id AND l.user_id = p_user_id
            ))
      );

    -- Total words learned
    SELECT COUNT(DISTINCT s.word_id) INTO v_total_words_learned
    FROM user_word_status s
    JOIN word_entries w ON w.id = s.word_id
    WHERE s.user_id = p_user_id
      AND s.mode = ANY(p_modes)
      AND s.fsrs_enabled = true
      AND (
            (p_list_id IS NULL AND w.is_nt2_2000 = true)
         OR (p_list_id IS NOT NULL AND p_list_type = 'curated' AND EXISTS (
                SELECT 1 FROM word_list_items li
                WHERE li.list_id = p_list_id AND li.word_id = w.id
            ))
         OR (p_list_id IS NOT NULL AND p_list_type = 'user' AND EXISTS (
                SELECT 1 FROM user_word_list_items li
                JOIN user_word_lists l ON l.id = li.list_id
                WHERE li.list_id = p_list_id AND li.word_id = w.id AND l.user_id = p_user_id
            ))
      );

    -- Total words in list
    SELECT COUNT(*) INTO v_total_words_in_list
    FROM word_entries w
    WHERE (
            (p_list_id IS NULL AND w.is_nt2_2000 = true)
         OR (p_list_id IS NOT NULL AND p_list_type = 'curated' AND EXISTS (
                SELECT 1 FROM word_list_items li
                WHERE li.list_id = p_list_id AND li.word_id = w.id
            ))
         OR (p_list_id IS NOT NULL AND p_list_type = 'user' AND EXISTS (
                SELECT 1 FROM user_word_list_items li
                JOIN user_word_lists l ON l.id = li.list_id
                WHERE li.list_id = p_list_id AND li.word_id = w.id AND l.user_id = p_user_id
            ))
      );

    RETURN jsonb_build_object(
        'newWordsToday', v_new_words_today,
        'newCardsToday', v_new_cards_today,
        'dailyNewLimit', v_daily_new_limit,
        'reviewWordsDone', v_review_words_done,
        'reviewCardsDone', v_review_cards_done,
        'reviewWordsDue', v_review_words_due,
        'reviewCardsDue', v_review_cards_due,
        'totalWordsLearned', v_total_words_learned,
        'totalWordsInList', v_total_words_in_list
    );
END;
$$;

-- =============================================================================
-- SCENARIO STATS
-- =============================================================================

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
    -- AUTH CHECK: Verify caller owns this user_id
    IF p_user_id != (select auth.uid()) THEN
        RAISE EXCEPTION 'unauthorized: user_id does not match authenticated user';
    END IF;

    SELECT card_modes INTO v_card_modes
    FROM training_scenarios WHERE id = p_scenario_id;
    
    IF v_card_modes IS NULL THEN
        RETURN jsonb_build_object('error', 'Scenario not found');
    END IF;
    
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
        'min_stability', null, 'avg_stability', null, 'max_stability', null,
        'cards_started', 0, 'cards_total', array_length(v_card_modes, 1), 'is_learned', false
    ));
END;
$$;

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
    -- AUTH CHECK: Verify caller owns this user_id
    IF p_user_id != (select auth.uid()) THEN
        RAISE EXCEPTION 'unauthorized: user_id does not match authenticated user';
    END IF;

    SELECT card_modes, graduation_threshold 
    INTO v_card_modes, v_graduation_threshold
    FROM training_scenarios WHERE id = p_scenario_id;
    
    IF v_card_modes IS NULL THEN
        RETURN jsonb_build_object('error', 'Scenario not found');
    END IF;
    
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

CREATE OR REPLACE FUNCTION get_training_scenarios()
RETURNS SETOF jsonb
LANGUAGE sql
SECURITY DEFINER
AS $$
    SELECT jsonb_build_object(
        'id', id, 'name_en', name_en, 'name_nl', name_nl,
        'description', description, 'card_modes', card_modes,
        'graduation_threshold', graduation_threshold,
        'enabled', enabled, 'sort_order', sort_order
    )
    FROM training_scenarios
    ORDER BY sort_order, id;
$$;
