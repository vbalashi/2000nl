-- Fix: when card_filter = 'new', skip learning-due selection and pick only unseen cards.
-- Runtime evidence showed get_next_word returning source: 'learning' even with card_filter='new'.

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
    v_review_pool_limit int := 10;  -- Fixed rotating pool size
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

    -- Count new cards introduced today
    SELECT COUNT(DISTINCT word_id) INTO v_new_today
    FROM user_review_log
    WHERE user_id = p_user_id
      AND mode = ANY(p_modes)
      AND review_type = 'new'
      AND reviewed_at::date = current_date;

    -- Count learning cards due (interval < 1 day, or NULL treated as 0)
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

    -- Count words in REVIEW_POOL (graduated with interval >= 1 day, AND DUE NOW)
    SELECT COUNT(*) INTO v_review_pool_size
    FROM user_word_status s
    JOIN word_entries w ON w.id = s.word_id
    WHERE s.user_id = p_user_id 
      AND s.mode = ANY(p_modes)
      AND s.fsrs_last_interval >= 1.0  -- Graduated (interval >= 1 day)
      AND s.next_review_at <= now()    -- Actually due now
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

    -- Priority A: queue_turn='new' OR card_filter='new'
    IF (p_queue_turn = 'new' OR p_card_filter = 'new') AND p_card_filter != 'review' THEN
        
        -- A1: Learning due ONLY when card_filter != 'new'
        IF v_word_id IS NULL AND p_card_filter != 'new' AND v_learning_due_count > 0 THEN
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

        -- A2: If no learning card (or card_filter='new'), pick an unseen card if quota allows
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

    -- Priority B: queue_turn='review' OR card_filter='review'
    IF v_word_id IS NULL AND (p_queue_turn = 'review' OR p_card_filter = 'review') AND p_card_filter != 'new' THEN
        
        -- B1: Pick from review pool (graduated cards that are DUE, sorted by most overdue first)
        SELECT s.word_id, s.mode, 'review' INTO v_word_id, v_selected_mode, v_source
        FROM user_word_status s
        JOIN word_entries w ON w.id = s.word_id
        WHERE s.user_id = p_user_id 
          AND s.mode = ANY(p_modes)
          AND s.fsrs_last_interval >= 1.0  -- Graduated
          AND s.next_review_at <= now()    -- Only select cards that are actually due
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
        ORDER BY s.next_review_at ASC  -- Most overdue first
        LIMIT 1;
    END IF;

    -- Priority C: Auto mode - pick based on what's available and due
    IF v_word_id IS NULL AND p_queue_turn = 'auto' AND p_card_filter = 'both' THEN
        
        -- C1: Overdue reviews
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

        -- C2: Learning due
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

        -- C3: New card if quota allows
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

    -- Fallback D: future-due review (practice)
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

    -- Fallback E: Practice mode - any word from pool
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

