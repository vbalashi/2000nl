-- Fix interval precision explosion in FSRS calculations
-- The numeric type can accumulate extreme precision (hundreds of digits)
-- which PostgreSQL cannot convert to interval type.

-- Fix the interval helper to round to reasonable precision
create or replace function fsrs6_interval(p_stability numeric, p_retention numeric, p_w20 numeric)
returns numeric
language plpgsql
immutable
as $$
declare
    factor numeric;
    result numeric;
begin
    if p_stability is null or p_stability <= 0 then
        return null;
    end if;
    factor := power(0.9, -1/p_w20) - 1;
    result := p_stability / factor * (power(p_retention, -1/p_w20) - 1);
    -- Round to 6 decimal places to prevent precision explosion
    return round(result, 6);
end;
$$;

-- Also fix fsrs6_compute to round stability and difficulty
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
            'interval', new_interval,
            'retrievability', 0.9,
            'elapsed', 0,
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

    -- Round all numeric outputs to prevent precision explosion
    return jsonb_build_object(
        'stability', round(new_stability, 6),
        'difficulty', round(new_difficulty, 6),
        'interval', round(new_interval, 6),
        'retrievability', round(retrievability, 6),
        'elapsed', round(elapsed_days, 6),
        'reps', reps_out,
        'lapses', lapses_out
    );
end;
$$;
