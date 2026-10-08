-- Preserve directional Known and existing rated scheduler state on meaning enrollment.
BEGIN;

CREATE OR REPLACE FUNCTION public.start_learning_entry_card(
    p_user_id uuid,
    p_entry_id uuid,
    p_card_type_id text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE
    v_dictionary_id uuid;
    v_other_card_type text := private.shared_meaning_other_direction(p_card_type_id);
BEGIN
    IF (select auth.uid()) IS NULL OR p_user_id IS DISTINCT FROM (select auth.uid()) THEN
        RAISE EXCEPTION 'unauthorized: user_id does not match authenticated user';
    END IF;

    SELECT dictionary_id INTO v_dictionary_id
    FROM public.word_entries
    WHERE id = p_entry_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'word entry not found';
    END IF;

    IF v_dictionary_id IS NOT NULL
       AND NOT public.can_access_dictionary(p_user_id, v_dictionary_id, 'read') THEN
        RAISE EXCEPTION 'dictionary access denied';
    END IF;

    -- Serialize against directional Known changes; never mutate a Known sibling.
    PERFORM pg_advisory_xact_lock(hashtext('shared-meaning-known:' || p_user_id::text || ':' || p_entry_id::text));

    INSERT INTO public.user_card_status (
        user_id, entry_id, card_type_id, fsrs_enabled, next_review_at,
        last_seen_at, seen_count, in_learning, hidden, frozen_until
    )
    VALUES (
        p_user_id, p_entry_id, p_card_type_id, true, private.training_reference_now_v1(), private.training_reference_now_v1(), 1,
        true, false, null
    )
    ON CONFLICT (user_id, entry_id, card_type_id) DO UPDATE
    SET fsrs_enabled = true,
        next_review_at = COALESCE(user_card_status.next_review_at, private.training_reference_now_v1()),
        last_seen_at = private.training_reference_now_v1(),
        seen_count = public.user_card_status.seen_count + 1,
        in_learning = CASE WHEN user_card_status.fsrs_last_grade IS NULL THEN true ELSE user_card_status.in_learning END,
        hidden = false,
        frozen_until = null;

    IF v_other_card_type IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.user_card_known_marks known
        WHERE known.user_id = p_user_id AND known.entry_id = p_entry_id
          AND known.card_type_id = v_other_card_type AND known.cleared_at IS NULL
    ) THEN
        INSERT INTO public.user_card_status (
            user_id, entry_id, card_type_id, fsrs_enabled, next_review_at,
            last_seen_at, seen_count, in_learning, hidden, frozen_until
        )
        VALUES (
            p_user_id, p_entry_id, v_other_card_type, true, private.training_reference_now_v1(), null, 0,
            true, false, null
        )
        ON CONFLICT (user_id, entry_id, card_type_id) DO UPDATE
        SET fsrs_enabled = true,
            next_review_at = COALESCE(user_card_status.next_review_at, private.training_reference_now_v1()),
            in_learning = CASE WHEN user_card_status.fsrs_last_grade IS NULL THEN true ELSE user_card_status.in_learning END,
            hidden = false,
            frozen_until = null;
    END IF;
END;
$$;

COMMIT;
