-- Fix FSRS "same-day" path being triggered by views.
--
-- Problem:
-- - The UI updates user_word_status.last_seen_at on *view* (recordWordView).
-- - handle_review/handle_click were passing last_seen_at into fsrs6_compute as "last review time".
-- - fsrs6_compute treats p_last_review_at::date = now()::date as "same_day", activating the
--   conservative same-day formula even for normal reviews, which can slightly shrink intervals.
--
-- Solution:
-- - Introduce user_word_status.last_reviewed_at: timestamp of the last *graded* interaction
--   (review/click) used for FSRS elapsed/same-day logic.
-- - Backfill it from user_review_log.
-- - Update handle_review and handle_click to use and maintain last_reviewed_at.

-- 1) Schema: last graded review time (separate from last_seen_at which is a view time).
alter table if exists user_word_status
  add column if not exists last_reviewed_at timestamptz;

-- 2) Backfill from audit log (best available source of actual review time).
with latest as (
  select user_id, word_id, mode, max(reviewed_at) as last_reviewed_at
  from user_review_log
  group by 1, 2, 3
)
update user_word_status s
set last_reviewed_at = latest.last_reviewed_at
from latest
where s.user_id = latest.user_id
  and s.word_id = latest.word_id
  and s.mode = latest.mode
  and s.last_reviewed_at is null;

-- 3) Update handle_review: use last_reviewed_at for FSRS elapsed/same-day, and update it on graded actions.
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

    -- Determine review_type based on FSRS data, not row existence (see 0031).
    v_review_type := CASE WHEN v_status.fsrs_stability IS NULL THEN 'new' ELSE 'review' END;
    v_scheduled := v_status.next_review_at;

    v_compute := fsrs6_compute(
        v_status.fsrs_stability,
        v_status.fsrs_difficulty,
        v_status.last_reviewed_at,  -- IMPORTANT: use graded review time (not view time)
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
        next_review_at, last_result, last_seen_at, last_reviewed_at,
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
        now(), -- graded review time
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
        last_reviewed_at = excluded.last_reviewed_at,
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

-- 4) Update handle_click: same idea; clicks are graded lapses, so they advance last_reviewed_at.
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
        v_status.last_reviewed_at,  -- IMPORTANT: use graded review time (not view time)
        1::smallint,                -- grade = again
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
        now(), -- graded click time
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
        last_reviewed_at = excluded.last_reviewed_at,
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

