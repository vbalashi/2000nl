-- Align the existing FSRS-6 compute path with fsrs-rs v4.1.1 for
-- scheduler-day (delta_t = 0) transitions. This migration intentionally does
-- not change rollover calculation, learning-step policy, or review logging.

BEGIN;

CREATE OR REPLACE FUNCTION fsrs6_compute(
    p_stability numeric,
    p_difficulty numeric,
    p_last_review_at timestamptz,
    p_grade smallint,
    p_target_retention numeric,
    p_reps int,
    p_lapses int,
    p_params numeric[]
) RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
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
BEGIN
    IF p_grade < 1 OR p_grade > 4 THEN
        RAISE EXCEPTION 'grade must be 1..4';
    END IF;

    IF p_stability IS NULL OR p_difficulty IS NULL THEN
        CASE p_grade
            WHEN 1 THEN new_stability := w0;
            WHEN 2 THEN new_stability := w1;
            WHEN 3 THEN new_stability := w2;
            WHEN 4 THEN new_stability := w3;
        END CASE;
        new_difficulty := w4 - exp(w5 * (p_grade - 1)) + 1;
        new_interval := fsrs6_interval(new_stability, p_target_retention, w20);
        reps_out := 1;
        lapses_out := CASE WHEN p_grade = 1 THEN 1 ELSE 0 END;
        RETURN jsonb_build_object(
            'stability', round(new_stability, 6),
            'difficulty', round(greatest(1, least(10, new_difficulty)), 6),
            'interval', round(new_interval, 6),
            'retrievability', 0.9,
            'elapsed', 0,
            'same_day', false,
            'reps', reps_out,
            'lapses', lapses_out
        );
    END IF;

    elapsed_days := greatest(0.0, extract(epoch from (now() - coalesce(p_last_review_at, now()))) / 86400);
    retrievability := power(1 + (power(0.9, -1/w20) - 1) * elapsed_days / greatest(p_stability, 0.0001), -w20);
    same_day := p_last_review_at IS NOT NULL AND (p_last_review_at::date = now()::date);

    tmp_d := p_difficulty + (-w6 * (p_grade - 3)) * (10 - p_difficulty) / 9;
    d0_easy := w4 - exp(w5 * 3) + 1;
    new_difficulty := w7 * d0_easy + (1 - w7) * tmp_d;
    new_difficulty := greatest(1, least(10, new_difficulty));
    reps_out := reps_out + 1;
    IF p_grade = 1 THEN
        lapses_out := lapses_out + 1;
    END IF;

    IF same_day THEN
        -- fsrs-rs v4.1.1 uses the short-term stability update for every
        -- rating at delta_t = 0. Successful ratings are clamped so that
        -- short-term practice cannot reduce existing stability.
        new_stability := p_stability * exp(w17 * (p_grade - 3 + w18)) * power(p_stability, -w19);
        IF p_grade >= 3 THEN
            new_stability := greatest(p_stability, new_stability);
        END IF;
    ELSIF p_grade = 1 THEN
        new_stability := w11 * power(new_difficulty, -w12) * (power(p_stability + 1, w13) - 1) * exp(w14 * (1 - retrievability));
    ELSE
        new_stability := p_stability * (
            exp(w8) *
            (11 - new_difficulty) *
            power(p_stability, -w9) *
            (exp(w10 * (1 - retrievability)) - 1) *
            (CASE WHEN p_grade = 2 THEN w15 ELSE 1 END) *
            (CASE WHEN p_grade = 4 THEN w16 ELSE 1 END)
            + 1
        );
    END IF;
    new_interval := fsrs6_interval(new_stability, p_target_retention, w20);

    RETURN jsonb_build_object(
        'stability', round(new_stability, 6),
        'difficulty', round(new_difficulty, 6),
        'interval', round(new_interval, 6),
        'retrievability', round(retrievability, 6),
        'elapsed', round(elapsed_days, 6),
        'same_day', same_day,
        'reps', reps_out,
        'lapses', lapses_out
    );
END;
$$;

COMMIT;
