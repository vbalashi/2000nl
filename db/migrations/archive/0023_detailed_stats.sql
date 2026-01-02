-- Detailed Training Stats RPC
-- Provides granular statistics for the footer display:
-- - New words/cards today vs daily limit
-- - Review words/cards done today vs scheduled
-- - Total progress

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

    -- New words today: distinct words introduced today (review_type = 'new')
    SELECT COUNT(DISTINCT word_id) INTO v_new_words_today
    FROM user_review_log
    WHERE user_id = p_user_id
      AND mode = ANY(p_modes)
      AND review_type = 'new'
      AND reviewed_at::date = current_date;

    -- New cards today: total new card reviews today
    SELECT COUNT(*) INTO v_new_cards_today
    FROM user_review_log
    WHERE user_id = p_user_id
      AND mode = ANY(p_modes)
      AND review_type = 'new'
      AND reviewed_at::date = current_date;

    -- Review words done today: distinct words with non-new reviews today
    SELECT COUNT(DISTINCT word_id) INTO v_review_words_done
    FROM user_review_log
    WHERE user_id = p_user_id
      AND mode = ANY(p_modes)
      AND review_type IN ('review', 'click')
      AND reviewed_at::date = current_date;

    -- Review cards done today: count of non-new reviews today
    SELECT COUNT(*) INTO v_review_cards_done
    FROM user_review_log
    WHERE user_id = p_user_id
      AND mode = ANY(p_modes)
      AND review_type IN ('review', 'click')
      AND reviewed_at::date = current_date;

    -- Review words due: distinct words due for review (graduated + learning, filtered by list)
    SELECT COUNT(DISTINCT s.word_id) INTO v_review_words_due
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
                WHERE li.list_id = p_list_id AND li.word_id = w.id
            ))
         OR (p_list_id IS NOT NULL AND p_list_type = 'user' AND EXISTS (
                SELECT 1 FROM user_word_list_items li
                JOIN user_word_lists l ON l.id = li.list_id
                WHERE li.list_id = p_list_id AND li.word_id = w.id AND l.user_id = p_user_id
            ))
      );

    -- Review cards due: count of cards due for review (graduated + learning, filtered by list)
    SELECT COUNT(*) INTO v_review_cards_due
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
