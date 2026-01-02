-- Fix handle_click: cast grade literal to smallint for fsrs6_compute compatibility
-- The fsrs6_compute function expects p_grade as smallint, but the literal 1 is integer

CREATE OR REPLACE FUNCTION handle_click(
    p_user_id uuid,
    p_word_id uuid,
    p_mode text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_status user_word_status%rowtype;
    v_params numeric[];
    v_target numeric;
    v_compute jsonb;
    v_interval numeric;
BEGIN
    INSERT INTO user_events (user_id, word_id, mode, event_type)
    VALUES (p_user_id, p_word_id, p_mode, 'definition_click');

    SELECT * INTO v_status
    FROM user_word_status
    WHERE user_id = p_user_id AND word_id = p_word_id AND mode = p_mode;

    v_params := fsrs6_parameters();
    SELECT COALESCE(target_retention, 0.9) INTO v_target
    FROM user_settings WHERE user_id = p_user_id;

    v_compute := fsrs6_compute(
        v_status.fsrs_stability,
        v_status.fsrs_difficulty,
        v_status.last_seen_at,
        1::smallint,  -- grade = again (must be smallint for function signature match)
        v_target,
        v_status.fsrs_reps,
        v_status.fsrs_lapses,
        v_params
    );

    v_interval := (v_compute->>'interval')::numeric;

    INSERT INTO user_word_status (
        user_id, word_id, mode,
        fsrs_stability, fsrs_difficulty, fsrs_reps, fsrs_lapses, fsrs_last_grade,
        fsrs_last_interval, fsrs_target_retention, fsrs_params_version, fsrs_enabled,
        next_review_at, last_result, last_seen_at,
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
        COALESCE(v_status.click_count, 0) + 1,
        COALESCE(v_status.seen_count, 0),
        false,
        null
    )
    ON CONFLICT (user_id, word_id, mode) DO UPDATE
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
        click_count = user_word_status.click_count + 1,
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
        jsonb_build_object('click', true)
    );
END;
$$;
