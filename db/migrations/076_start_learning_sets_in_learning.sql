CREATE OR REPLACE FUNCTION public.start_learning_entry_card(p_user_id uuid, p_entry_id uuid, p_card_type_id text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_dictionary_id uuid;
BEGIN
    IF (select auth.uid()) IS NULL OR p_user_id IS DISTINCT FROM (select auth.uid()) THEN
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
        in_learning,
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
        true,
        false,
        null
    )
    ON CONFLICT (user_id, entry_id, card_type_id) DO UPDATE
    SET fsrs_enabled = true,
        next_review_at = COALESCE(user_card_status.next_review_at, now()),
        last_seen_at = now(),
        seen_count = user_card_status.seen_count + 1,
        in_learning = true,
        hidden = false,
        frozen_until = null;
END;
$function$;
