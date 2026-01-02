-- Add FSRS debug visibility for console diagnostics.
--
-- Goal:
-- - Make it easy to see which FSRS path was used (same-day vs normal),
--   and what the computed elapsed_days + retrievability (R) were at review time.
--
-- Approach:
-- - Extend fsrs6_compute() JSON output with "same_day".
-- - Store {elapsed, retrievability, same_day} in user_review_log.metadata for reviews/clicks.
-- - Add a small RPC get_last_review_debug() so the UI can fetch & log the last decision.

-- 1) Extend FSRS compute output with `same_day`.
create or replace function fsrs6_compute(
    p_stability numeric,
    p_difficulty numeric,
    p_last_review_at timestamptz,
    p_grade smallint,               -- 1..4
    p_target_retention numeric,
    p_reps int,
    p_lapses int,
    p_params numeric[]
) returns jsonb
language plpgsql
as $$
declare
    w0 numeric := p_params[1];
    w1 numeric := p_params[2];
    w2 numeric := p_params[3];
    w3 numeric := p_params[4];
    w4 numeric := p_params[5];
    w5 numeric := p_params[6];
    w6 numeric := p_params[7];
    w7 numeric := p_params[8];
    w8 numeric := p_params[9];
    w9 numeric := p_params[10];
    w10 numeric := p_params[11];
    w11 numeric := p_params[12];
    w12 numeric := p_params[13];
    w13 numeric := p_params[14];
    w14 numeric := p_params[15];
    w15 numeric := p_params[16];
    w16 numeric := p_params[17];
    w17 numeric := p_params[18];
    w18 numeric := p_params[19];
    w19 numeric := p_params[20];
    w20 numeric := p_params[21];

    new_stability numeric;
    new_difficulty numeric;
    new_interval numeric;
    elapsed_days numeric;
    retrievability numeric;
    reps_out int := coalesce(p_reps, 0);
    lapses_out int := coalesce(p_lapses, 0);
    same_day boolean := false;
    d0_easy numeric;
    tmp_d numeric;
begin
    if p_grade < 1 or p_grade > 4 then
        raise exception 'grade must be 1..4';
    end if;

    -- Initial state
    if p_stability is null or p_difficulty is null then
        case p_grade
            when 1 then new_stability := w0;
            when 2 then new_stability := w1;
            when 3 then new_stability := w2;
            when 4 then new_stability := w3;
        end case;
        new_difficulty := w4 - exp(w5 * (p_grade - 1)) + 1;
        new_interval := fsrs6_interval(new_stability, p_target_retention, w20);
        reps_out := 1;
        lapses_out := case when p_grade = 1 then 1 else 0 end;
        return jsonb_build_object(
            'stability', round(new_stability, 6),
            'difficulty', round(greatest(1, least(10, new_difficulty)), 6),
            'interval', round(new_interval, 6),
            'retrievability', 0.9,
            'elapsed', 0,
            'same_day', false,
            'reps', reps_out,
            'lapses', lapses_out
        );
    end if;

    elapsed_days := greatest(0.0, extract(epoch from (now() - coalesce(p_last_review_at, now()))) / 86400);
    retrievability := power(1 + (power(0.9, -1/w20) - 1) * elapsed_days / greatest(p_stability, 0.0001), -w20);
    same_day := p_last_review_at is not null and (p_last_review_at::date = now()::date);

    -- Difficulty update
    tmp_d := p_difficulty + (-w6 * (p_grade - 3)) * (10 - p_difficulty) / 9;
    d0_easy := w4 - exp(w5 * 3) + 1; -- D0(4)
    new_difficulty := w7 * d0_easy + (1 - w7) * tmp_d;
    new_difficulty := greatest(1, least(10, new_difficulty));

    if p_grade = 1 then
        -- Lapse
        lapses_out := lapses_out + 1;
        reps_out := reps_out + 1;
        new_stability := w11 * power(new_difficulty, -w12) * (power(p_stability + 1, w13) - 1) * exp(w14 * (1 - retrievability));
        new_interval := fsrs6_interval(new_stability, p_target_retention, w20);
    else
        -- Recall
        reps_out := reps_out + 1;
        if same_day then
            new_stability := p_stability * exp(w17 * (p_grade - 3 + w18)) * power(p_stability, -w19);
        else
            new_stability := p_stability * (
                exp(w8) *
                (11 - new_difficulty) *
                power(p_stability, -w9) *
                (exp(w10 * (1 - retrievability)) - 1) *
                (case when p_grade = 2 then w15 else 1 end) *
                (case when p_grade = 4 then w16 else 1 end)
                + 1
            );
        end if;
        new_interval := fsrs6_interval(new_stability, p_target_retention, w20);
    end if;

    return jsonb_build_object(
        'stability', round(new_stability, 6),
        'difficulty', round(new_difficulty, 6),
        'interval', round(new_interval, 6),
        'retrievability', round(retrievability, 6),
        'elapsed', round(elapsed_days, 6),
        'same_day', same_day,
        'reps', reps_out,
        'lapses', lapses_out
    );
end;
$$;

-- 2) Store debug metadata for reviews/clicks.
-- Recreate handle_review + handle_click to attach metadata from fsrs6_compute().

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
    v_meta jsonb;
BEGIN
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
        last_reviewed_at = excluded.last_reviewed_at,
        seen_count = user_word_status.seen_count + 1;

    INSERT INTO user_review_log (
        user_id, word_id, mode, grade, review_type,
        scheduled_at, reviewed_at,
        stability_before, difficulty_before,
        stability_after, difficulty_after,
        interval_after, params_version, metadata
    ) VALUES (
        p_user_id, p_word_id, p_mode, v_grade, v_review_type,
        v_scheduled, now(),
        v_status.fsrs_stability, v_status.fsrs_difficulty,
        (v_compute->>'stability')::numeric,
        (v_compute->>'difficulty')::numeric,
        v_interval,
        'fsrs-6-default',
        v_meta
    );

    INSERT INTO user_events (user_id, word_id, mode, event_type)
    VALUES (p_user_id, p_word_id, p_mode, 'review_' || p_result);
END;
$$;

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
    v_meta jsonb;
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
        v_meta
    );
END;
$$;

-- 3) UI-friendly RPC: fetch last review log + metadata for a specific card.
create or replace function get_last_review_debug(
  p_user_id uuid,
  p_word_id uuid,
  p_mode text
) returns jsonb
language plpgsql
security definer
as $$
declare
  v_row user_review_log%rowtype;
begin
  select *
  into v_row
  from user_review_log
  where user_id = p_user_id
    and word_id = p_word_id
    and mode = p_mode
  order by reviewed_at desc
  limit 1;

  if v_row.id is null then
    return null;
  end if;

  return jsonb_build_object(
    'reviewed_at', v_row.reviewed_at,
    'scheduled_at', v_row.scheduled_at,
    'review_type', v_row.review_type,
    'grade', v_row.grade,
    'interval_after', v_row.interval_after,
    'stability_before', v_row.stability_before,
    'stability_after', v_row.stability_after,
    'metadata', coalesce(v_row.metadata, '{}'::jsonb)
  );
end;
$$;

