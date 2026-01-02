-- Counter Logic Redesign
-- 
-- NIEUW (x/X):
--   X = daily_new_limit from settings
--   x = new words introduced today that have GRADUATED (interval >= 1 day)
--
-- HERHALING (y/Y):
--   Y = review cards due today (cards in REVIEW queue, NOT new cards introduced today)
--       This should be fixed at session start in the UI
--   y = review cards done today where interval_after >= 1 day (successfully reviewed)
--
-- Key: Cards introduced today (review_type='new') are in NEW queue, not REVIEW queue

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
    -- Validate modes array
    IF p_modes IS NULL OR array_length(p_modes, 1) IS NULL THEN
        p_modes := ARRAY['word-to-definition'];
    END IF;

    -- Validate list type
    IF p_list_id IS NOT NULL AND p_list_type IS NULL THEN
        p_list_type := 'curated';
    END IF;

    -- Get daily new limit from user settings
    SELECT COALESCE(daily_new_limit, 10) INTO v_daily_new_limit
    FROM user_settings
    WHERE user_id = p_user_id;
    
    IF v_daily_new_limit IS NULL THEN
        v_daily_new_limit := 10;
    END IF;

    -- ============================================================
    -- NIEUW x: New words introduced today that have GRADUATED
    -- Only counts if current interval >= 1 day (successfully learned)
    -- ============================================================
    SELECT COUNT(DISTINCT rl.word_id) INTO v_new_words_today
    FROM user_review_log rl
    JOIN user_word_status s ON s.word_id = rl.word_id 
        AND s.user_id = rl.user_id 
        AND s.mode = rl.mode
    WHERE rl.user_id = p_user_id
      AND rl.mode = ANY(p_modes)
      AND rl.review_type = 'new'
      AND rl.reviewed_at::date = current_date
      AND s.fsrs_last_interval >= 1.0;  -- Must have graduated

    -- New cards today: same as new words (we count distinct words, not card reviews)
    v_new_cards_today := v_new_words_today;

    -- ============================================================
    -- HERHALING y: Review cards done today (graduated after review)
    -- Only counts reviews where interval_after >= 1 day
    -- Excludes new cards (review_type must be 'review')
    -- ============================================================
    SELECT COUNT(DISTINCT word_id) INTO v_review_words_done
    FROM user_review_log
    WHERE user_id = p_user_id
      AND mode = ANY(p_modes)
      AND review_type = 'review'  -- NOT 'new' - only actual reviews
      AND reviewed_at::date = current_date
      AND interval_after >= 1.0;  -- Successfully graduated (done for today)

    SELECT COUNT(*) INTO v_review_cards_done
    FROM user_review_log
    WHERE user_id = p_user_id
      AND mode = ANY(p_modes)
      AND review_type = 'review'  -- NOT 'new' - only actual reviews
      AND reviewed_at::date = current_date
      AND interval_after >= 1.0;  -- Successfully graduated (done for today)

    -- ============================================================
    -- HERHALING Y: Review cards due today
    -- Cards in REVIEW queue (have status, due today)
    -- EXCLUDES cards introduced today (they are in NEW queue)
    -- ============================================================
    SELECT COUNT(DISTINCT s.word_id) INTO v_review_words_due
    FROM user_word_status s
    JOIN word_entries w ON w.id = s.word_id
    WHERE s.user_id = p_user_id
      AND s.mode = ANY(p_modes)
      AND s.next_review_at < (current_date + interval '1 day')
      AND (s.frozen_until IS NULL OR s.frozen_until <= now())
      AND s.hidden = false
      AND s.fsrs_enabled = true
      -- EXCLUDE cards introduced TODAY (they are NEW queue, not REVIEW queue)
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
      -- EXCLUDE cards introduced TODAY (they are NEW queue, not REVIEW queue)
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

    -- Total words learned: distinct words with FSRS state (filtered by list)
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
