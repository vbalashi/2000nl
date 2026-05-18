-- Extend card state payload for platform API lookup responses.

CREATE OR REPLACE FUNCTION get_card_user_state(
    p_user_id uuid,
    p_word_id uuid,
    p_mode text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
DECLARE
    v_dictionary_id uuid;
    v_result jsonb;
BEGIN
    IF p_user_id != (select auth.uid()) THEN
        RAISE EXCEPTION 'unauthorized: user_id does not match authenticated user';
    END IF;

    SELECT dictionary_id INTO v_dictionary_id
    FROM word_entries
    WHERE id = p_word_id;

    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    IF v_dictionary_id IS NOT NULL
       AND NOT can_access_dictionary(p_user_id, v_dictionary_id, 'read') THEN
        RETURN NULL;
    END IF;

    SELECT jsonb_build_object(
        'fsrs_last_interval', s.fsrs_last_interval,
        'fsrs_reps', s.fsrs_reps,
        'fsrs_stability', s.fsrs_stability,
        'fsrs_difficulty', s.fsrs_difficulty,
        'fsrs_lapses', s.fsrs_lapses,
        'fsrs_last_grade', s.fsrs_last_grade,
        'click_count', s.click_count,
        'last_seen_at', s.last_seen_at,
        'last_reviewed_at', s.last_reviewed_at,
        'next_review_at', s.next_review_at,
        'hidden', s.hidden,
        'frozen_until', s.frozen_until,
        'in_learning', s.in_learning,
        'learning_due_at', s.learning_due_at
    )
    INTO v_result
    FROM user_word_status s
    WHERE s.user_id = p_user_id
      AND s.word_id = p_word_id
      AND s.mode = p_mode;

    RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION get_card_user_state(uuid, uuid, text) TO authenticated;
