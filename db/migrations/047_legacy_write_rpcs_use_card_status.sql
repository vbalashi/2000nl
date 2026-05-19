-- Keep legacy-named write RPCs on the physical card-state source.

CREATE OR REPLACE FUNCTION record_word_view(
    p_user_id uuid,
    p_word_id uuid,
    p_mode text
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT record_card_view(p_user_id, p_word_id, p_mode);
$$;

CREATE OR REPLACE FUNCTION start_learning_card(
    p_user_id uuid,
    p_word_id uuid,
    p_mode text
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT start_learning_entry_card(p_user_id, p_word_id, p_mode);
$$;

CREATE OR REPLACE FUNCTION handle_review(
    p_user_id uuid,
    p_word_id uuid,
    p_mode text,
    p_result text,
    p_turn_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT handle_card_review(p_user_id, p_word_id, p_mode, p_result, p_turn_id);
$$;

CREATE OR REPLACE FUNCTION handle_click(
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
    v_status user_card_status%rowtype;
    v_params numeric[];
    v_target numeric;
    v_compute jsonb;
    v_interval numeric;
    v_meta jsonb;
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

    INSERT INTO user_events (user_id, word_id, mode, event_type)
    VALUES (p_user_id, p_word_id, p_mode, 'definition_click');

    SELECT * INTO v_status
    FROM user_card_status
    WHERE user_id = p_user_id
      AND entry_id = p_word_id
      AND card_type_id = p_mode;

    v_params := fsrs6_parameters();
    SELECT COALESCE(target_retention, 0.9) INTO v_target
    FROM user_settings
    WHERE user_id = p_user_id;

    v_compute := fsrs6_compute(
        v_status.fsrs_stability,
        v_status.fsrs_difficulty,
        v_status.last_reviewed_at,
        1::smallint,
        v_target,
        v_status.fsrs_reps,
        v_status.fsrs_lapses,
        v_params
    );

    v_interval := (v_compute->>'interval')::numeric;
    v_meta := jsonb_build_object(
        'click', true,
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
        click_count, seen_count,
        in_learning, learning_due_at
    )
    VALUES (
        p_user_id, p_word_id, p_mode,
        (v_compute->>'stability')::numeric,
        (v_compute->>'difficulty')::numeric,
        (v_compute->>'reps')::int,
        (v_compute->>'lapses')::int,
        1,
        v_interval,
        v_target,
        'fsrs-6-default',
        true,
        now() + (v_interval || ' days')::interval,
        'fail',
        now(),
        now(),
        COALESCE(v_status.click_count, 0) + 1,
        COALESCE(v_status.seen_count, 0),
        false,
        null
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
        click_count = user_card_status.click_count + 1,
        in_learning = false,
        learning_due_at = null;

    INSERT INTO user_review_log (
        user_id, word_id, mode, grade, review_type,
        scheduled_at, reviewed_at,
        stability_before, difficulty_before,
        stability_after, difficulty_after,
        interval_after, params_version, metadata
    ) VALUES (
        p_user_id, p_word_id, p_mode, 1, 'click',
        v_status.next_review_at, now(),
        v_status.fsrs_stability, v_status.fsrs_difficulty,
        (v_compute->>'stability')::numeric,
        (v_compute->>'difficulty')::numeric,
        v_interval,
        'fsrs-6-default',
        v_meta
    );
END;
$$;

GRANT EXECUTE ON FUNCTION record_word_view(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION start_learning_card(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION handle_review(uuid, uuid, text, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION handle_click(uuid, uuid, text) TO authenticated;
