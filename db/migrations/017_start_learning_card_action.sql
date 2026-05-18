-- Explicit action for starting a card without grading it.
-- Generated: 2026-05-18

CREATE OR REPLACE FUNCTION start_learning_card(
    p_user_id uuid,
    p_word_id uuid,
    p_mode text
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
    WHERE id = p_word_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'word entry not found';
    END IF;

    IF v_dictionary_id IS NOT NULL
       AND NOT can_access_dictionary(p_user_id, v_dictionary_id, 'read') THEN
        RAISE EXCEPTION 'dictionary access denied';
    END IF;

    INSERT INTO user_word_status (
        user_id,
        word_id,
        mode,
        fsrs_enabled,
        next_review_at,
        last_seen_at,
        seen_count,
        hidden,
        frozen_until
    )
    VALUES (
        p_user_id,
        p_word_id,
        p_mode,
        true,
        now(),
        now(),
        1,
        false,
        null
    )
    ON CONFLICT (user_id, word_id, mode) DO UPDATE
    SET fsrs_enabled = true,
        next_review_at = COALESCE(user_word_status.next_review_at, now()),
        last_seen_at = now(),
        seen_count = user_word_status.seen_count + 1,
        hidden = false,
        frozen_until = null;
END;
$$;

GRANT EXECUTE ON FUNCTION start_learning_card(uuid, uuid, text) TO authenticated;
