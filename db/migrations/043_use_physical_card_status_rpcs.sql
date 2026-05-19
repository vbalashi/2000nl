-- Move low-risk card-facing RPCs onto physical user_card_status storage.
-- Later migrations make these card-facing RPCs the active runtime contract.

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
    FROM user_card_status s
    WHERE s.user_id = p_user_id
      AND s.entry_id = p_word_id
      AND s.card_type_id = p_mode;

    RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION record_card_view(
    p_user_id uuid,
    p_entry_id uuid,
    p_card_type_id text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_dictionary_id uuid;
BEGIN
    IF p_user_id != (select auth.uid()) THEN
        RAISE EXCEPTION 'unauthorized: user_id does not match authenticated user';
    END IF;

    SELECT dictionary_id INTO v_dictionary_id
    FROM word_entries
    WHERE id = p_entry_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'word entry not found';
    END IF;

    IF v_dictionary_id IS NOT NULL
       AND NOT can_access_dictionary(p_user_id, v_dictionary_id, 'read') THEN
        RAISE EXCEPTION 'dictionary access denied';
    END IF;

    INSERT INTO user_card_status (user_id, entry_id, card_type_id, last_seen_at)
    VALUES (p_user_id, p_entry_id, p_card_type_id, now())
    ON CONFLICT (user_id, entry_id, card_type_id) DO UPDATE
    SET last_seen_at = excluded.last_seen_at;
END;
$$;

CREATE OR REPLACE FUNCTION start_learning_entry_card(
    p_user_id uuid,
    p_entry_id uuid,
    p_card_type_id text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_dictionary_id uuid;
BEGIN
    IF p_user_id != (select auth.uid()) THEN
        RAISE EXCEPTION 'unauthorized: user_id does not match authenticated user';
    END IF;

    SELECT dictionary_id INTO v_dictionary_id
    FROM word_entries
    WHERE id = p_entry_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'word entry not found';
    END IF;

    IF v_dictionary_id IS NOT NULL
       AND NOT can_access_dictionary(p_user_id, v_dictionary_id, 'read') THEN
        RAISE EXCEPTION 'dictionary access denied';
    END IF;

    INSERT INTO user_card_status (
        user_id,
        entry_id,
        card_type_id,
        fsrs_enabled,
        next_review_at,
        last_seen_at,
        seen_count,
        hidden,
        frozen_until
    )
    VALUES (
        p_user_id,
        p_entry_id,
        p_card_type_id,
        true,
        now(),
        now(),
        1,
        false,
        null
    )
    ON CONFLICT (user_id, entry_id, card_type_id) DO UPDATE
    SET fsrs_enabled = true,
        next_review_at = COALESCE(user_card_status.next_review_at, now()),
        last_seen_at = now(),
        seen_count = user_card_status.seen_count + 1,
        hidden = false,
        frozen_until = null;
END;
$$;

GRANT EXECUTE ON FUNCTION get_card_user_state(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION record_card_view(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION start_learning_entry_card(uuid, uuid, text) TO authenticated;
