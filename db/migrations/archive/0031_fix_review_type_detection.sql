-- Fix review_type detection in handle_review
-- Previously: review_type was 'new' only if no status row existed
-- Problem: recordWordView creates a status row when word is shown, so all reviews were 'review'
-- Fix: Check if card has FSRS data (fsrs_stability IS NULL) to determine if it's truly new

CREATE OR REPLACE FUNCTION handle_review(
    p_user_id uuid,
    p_word_id uuid,
    p_mode text,
    p_result text -- 'fail' (again), 'hard', 'success' (good), 'easy', 'freeze', 'hide'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_status user_word_status%rowtype;
    v_grade smallint;
    v_params numeric[];
    v_target numeric;
    v_compute jsonb;
    v_review_type text;
    v_scheduled timestamptz;
    v_interval numeric;
BEGIN
    -- Handle non-review states
    IF p_result = 'hide' THEN
        INSERT INTO user_word_status (user_id, word_id, mode, hidden, last_result, last_seen_at)
        VALUES (p_user_id, p_word_id, p_mode, true, 'hide', now())
        ON CONFLICT (user_id, word_id, mode) DO UPDATE
        SET hidden = true, last_result = 'hide', last_seen_at = now();
        
        INSERT INTO user_events (user_id, word_id, mode, event_type)
        VALUES (p_user_id, p_word_id, p_mode, 'hide');
        RETURN;
    END IF;

    IF p_result = 'freeze' THEN
        INSERT INTO user_word_status (user_id, word_id, mode, frozen_until, last_result, last_seen_at)
        VALUES (p_user_id, p_word_id, p_mode, now() + interval '1 day', 'freeze', now())
        ON CONFLICT (user_id, word_id, mode) DO UPDATE
        SET frozen_until = now() + interval '1 day', last_result = 'freeze', last_seen_at = now();
        
        INSERT INTO user_events (user_id, word_id, mode, event_type)
        VALUES (p_user_id, p_word_id, p_mode, 'freeze');
        RETURN;
    END IF;

    -- Map result to FSRS grade
    v_grade := CASE p_result
        WHEN 'fail' THEN 1
        WHEN 'hard' THEN 2
        WHEN 'success' THEN 3
        WHEN 'easy' THEN 4
        ELSE 1
    END;

    SELECT * INTO v_status
    FROM user_word_status
    WHERE user_id = p_user_id AND word_id = p_word_id AND mode = p_mode;

    v_params := fsrs6_parameters();
    SELECT COALESCE(target_retention, 0.9) INTO v_target
    FROM user_settings WHERE user_id = p_user_id;

    -- FIX: Determine review_type based on FSRS data, not row existence
    -- A card is 'new' if it has no FSRS stability (never been through FSRS computation)
    -- This handles the case where recordWordView creates a row before the first review
    v_review_type := CASE WHEN v_status.fsrs_stability IS NULL THEN 'new' ELSE 'review' END;
    v_scheduled := v_status.next_review_at;

    v_compute := fsrs6_compute(
        v_status.fsrs_stability,
        v_status.fsrs_difficulty,
        v_status.last_seen_at,
        v_grade,
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
        click_count, seen_count
    )
    VALUES (
        p_user_id, p_word_id, p_mode,
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
        COALESCE(v_status.click_count, 0),
        COALESCE(v_status.seen_count, 0) + 1
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
        seen_count = user_word_status.seen_count + 1;

    INSERT INTO user_review_log (
        user_id, word_id, mode, grade, review_type,
        scheduled_at, reviewed_at,
        stability_before, difficulty_before,
        stability_after, difficulty_after,
        interval_after, params_version
    ) VALUES (
        p_user_id, p_word_id, p_mode, v_grade, v_review_type,
        v_scheduled, now(),
        v_status.fsrs_stability, v_status.fsrs_difficulty,
        (v_compute->>'stability')::numeric,
        (v_compute->>'difficulty')::numeric,
        v_interval,
        'fsrs-6-default'
    );

    INSERT INTO user_events (user_id, word_id, mode, event_type)
    VALUES (p_user_id, p_word_id, p_mode, 'review_' || p_result);
END;
$$;
