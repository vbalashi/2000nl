-- Record card-facing reviews against physical user_card_status while keeping
-- the existing review log and event shapes.

CREATE OR REPLACE FUNCTION handle_card_review(
    p_user_id uuid,
    p_entry_id uuid,
    p_card_type_id text,
    p_result text,
    p_turn_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_dictionary_id uuid;
    v_status user_card_status%rowtype;
    v_grade smallint;
    v_params numeric[];
    v_target numeric;
    v_compute jsonb;
    v_review_type text;
    v_scheduled timestamptz;
    v_interval numeric;
    v_meta jsonb;
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

    IF p_turn_id IS NOT NULL THEN
        PERFORM pg_advisory_xact_lock(hashtext(p_turn_id::text));

        IF EXISTS (
            SELECT 1
            FROM user_review_log
            WHERE turn_id = p_turn_id
        ) THEN
            RETURN;
        END IF;
    END IF;

    IF p_result = 'hide' THEN
        INSERT INTO user_card_status (
            user_id, entry_id, card_type_id, hidden, last_result, last_seen_at
        )
        VALUES (p_user_id, p_entry_id, p_card_type_id, true, 'hide', now())
        ON CONFLICT (user_id, entry_id, card_type_id) DO UPDATE
        SET hidden = true, last_result = 'hide', last_seen_at = now();

        INSERT INTO user_events (user_id, word_id, mode, event_type)
        VALUES (p_user_id, p_entry_id, p_card_type_id, 'hide');
        RETURN;
    END IF;

    IF p_result = 'freeze' THEN
        INSERT INTO user_card_status (
            user_id, entry_id, card_type_id, frozen_until, last_result, last_seen_at
        )
        VALUES (p_user_id, p_entry_id, p_card_type_id, now() + interval '1 day', 'freeze', now())
        ON CONFLICT (user_id, entry_id, card_type_id) DO UPDATE
        SET frozen_until = now() + interval '1 day',
            last_result = 'freeze',
            last_seen_at = now();

        INSERT INTO user_events (user_id, word_id, mode, event_type)
        VALUES (p_user_id, p_entry_id, p_card_type_id, 'freeze');
        RETURN;
    END IF;

    v_grade := CASE p_result
        WHEN 'fail' THEN 1
        WHEN 'hard' THEN 2
        WHEN 'success' THEN 3
        WHEN 'easy' THEN 4
        ELSE 1
    END;

    SELECT * INTO v_status
    FROM user_card_status
    WHERE user_id = p_user_id
      AND entry_id = p_entry_id
      AND card_type_id = p_card_type_id;

    IF p_turn_id IS NULL
        AND v_status.last_reviewed_at IS NOT NULL
        AND (now() - v_status.last_reviewed_at) < interval '10 seconds' THEN
        RETURN;
    END IF;

    v_params := fsrs6_parameters();
    SELECT COALESCE(target_retention, 0.9) INTO v_target
    FROM user_settings
    WHERE user_id = p_user_id;

    v_review_type := CASE WHEN v_status.fsrs_stability IS NULL THEN 'new' ELSE 'review' END;
    v_scheduled := v_status.next_review_at;

    v_compute := fsrs6_compute(
        v_status.fsrs_stability,
        v_status.fsrs_difficulty,
        v_status.last_reviewed_at,
        v_grade,
        v_target,
        v_status.fsrs_reps,
        v_status.fsrs_lapses,
        v_params
    );

    v_interval := (v_compute->>'interval')::numeric;
    v_meta := jsonb_build_object(
        'elapsed_days', (v_compute->>'elapsed')::numeric,
        'retrievability', (v_compute->>'retrievability')::numeric,
        'same_day', (v_compute->>'same_day')::boolean,
        'last_reviewed_at_before', v_status.last_reviewed_at
    );

    INSERT INTO user_card_status (
        user_id, entry_id, card_type_id,
        fsrs_stability, fsrs_difficulty, fsrs_reps, fsrs_lapses, fsrs_last_grade,
        fsrs_last_interval, fsrs_target_retention, fsrs_params_version, fsrs_enabled,
        next_review_at, last_result, last_seen_at, last_reviewed_at,
        click_count, seen_count
    )
    VALUES (
        p_user_id, p_entry_id, p_card_type_id,
        (v_compute->>'stability')::numeric,
        (v_compute->>'difficulty')::numeric,
        (v_compute->>'reps')::int,
        (v_compute->>'lapses')::int,
        v_grade,
        v_interval,
        v_target,
        'fsrs-6-default',
        true,
        now() + (v_interval || ' days')::interval,
        p_result,
        now(),
        now(),
        COALESCE(v_status.click_count, 0),
        COALESCE(v_status.seen_count, 0) + 1
    )
    ON CONFLICT (user_id, entry_id, card_type_id) DO UPDATE
    SET fsrs_stability = excluded.fsrs_stability,
        fsrs_difficulty = excluded.fsrs_difficulty,
        fsrs_reps = excluded.fsrs_reps,
        fsrs_lapses = excluded.fsrs_lapses,
        fsrs_last_grade = excluded.fsrs_last_grade,
        fsrs_last_interval = excluded.fsrs_last_interval,
        fsrs_target_retention = excluded.fsrs_target_retention,
        fsrs_params_version = excluded.fsrs_params_version,
        fsrs_enabled = true,
        next_review_at = excluded.next_review_at,
        last_result = excluded.last_result,
        last_seen_at = excluded.last_seen_at,
        last_reviewed_at = excluded.last_reviewed_at,
        seen_count = user_card_status.seen_count + 1;

    INSERT INTO user_review_log (
        user_id, word_id, mode, turn_id, grade, review_type,
        scheduled_at, reviewed_at,
        stability_before, difficulty_before,
        stability_after, difficulty_after,
        interval_after, params_version, metadata
    ) VALUES (
        p_user_id, p_entry_id, p_card_type_id, p_turn_id, v_grade, v_review_type,
        v_scheduled, now(),
        v_status.fsrs_stability, v_status.fsrs_difficulty,
        (v_compute->>'stability')::numeric,
        (v_compute->>'difficulty')::numeric,
        v_interval,
        'fsrs-6-default',
        v_meta
    );

    INSERT INTO user_events (user_id, word_id, mode, event_type)
    VALUES (p_user_id, p_entry_id, p_card_type_id, 'review_' || p_result);
END;
$$;

GRANT EXECUTE ON FUNCTION handle_card_review(uuid, uuid, text, text, uuid) TO authenticated;
