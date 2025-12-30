-- FSRS-6 functions and RPCs (replacing SM2 handlers)

-- Parameter set for FSRS-6 (default)
create or replace function fsrs6_parameters()
returns numeric[]
language sql
immutable
as $$
    select array[
        0.212,   -- w0 S0(again)
        1.2931,  -- w1 S0(hard)
        2.3065,  -- w2 S0(good)
        8.2956,  -- w3 S0(easy)
        6.4133,  -- w4 D base
        0.8334,  -- w5 D exponent
        3.0194,  -- w6 delta D scale
        0.001,   -- w7 mean reversion weight
        1.8722,  -- w8 stability scale
        0.1666,  -- w9 stability S power
        0.796,   -- w10 stability R scale
        1.4835,  -- w11 post-lapse scale
        0.0614,  -- w12 post-lapse D power (negative in formula)
        0.2629,  -- w13 post-lapse S power
        1.6483,  -- w14 post-lapse R scale
        0.6014,  -- w15 hard penalty
        1.8729,  -- w16 easy bonus
        0.5425,  -- w17 same-day scale
        0.0912,  -- w18 same-day offset
        0.0658,  -- w19 same-day S power
        0.1542   -- w20 decay
    ];
$$;

-- Interval helper based on requested retention
create or replace function fsrs6_interval(p_stability numeric, p_retention numeric, p_w20 numeric)
returns numeric
language plpgsql
immutable
as $$
declare
    factor numeric;
begin
    if p_stability is null or p_stability <= 0 then
        return null;
    end if;
    factor := power(0.9, -1/p_w20) - 1;
    return p_stability / factor * (power(p_retention, -1/p_w20) - 1);
end;
$$;

-- Core FSRS-6 update
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
            'stability', new_stability,
            'difficulty', greatest(1, least(10, new_difficulty)),
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

    return jsonb_build_object(
        'stability', new_stability,
        'difficulty', new_difficulty,
        'interval', new_interval,
        'retrievability', retrievability,
        'elapsed', elapsed_days,
        'reps', reps_out,
        'lapses', lapses_out
    );
end;
$$;

-- Main review handler (FSRS-6)
create or replace function handle_review(
    p_user_id uuid,
    p_word_id uuid,
    p_mode text,
    p_result text -- 'success', 'fail', 'freeze', 'hide'
)
returns void
language plpgsql
security definer
as $$
declare
    v_status user_word_status%rowtype;
    v_grade smallint;
    v_params numeric[];
    v_target numeric;
    v_compute jsonb;
    v_review_type text;
    v_scheduled timestamptz;
    v_interval numeric;
begin
    -- Handle non-review states
    if p_result = 'hide' then
        insert into user_word_status (user_id, word_id, mode, hidden, last_result, last_seen_at)
        values (p_user_id, p_word_id, p_mode, true, 'hide', now())
        on conflict (user_id, word_id, mode) do update
        set hidden = true, last_result = 'hide', last_seen_at = now();
        
        insert into user_events (user_id, word_id, mode, event_type)
        values (p_user_id, p_word_id, p_mode, 'hide');
        return;
    end if;

    if p_result = 'freeze' then
        insert into user_word_status (user_id, word_id, mode, frozen_until, last_result, last_seen_at)
        values (p_user_id, p_word_id, p_mode, now() + interval '1 day', 'freeze', now())
        on conflict (user_id, word_id, mode) do update
        set frozen_until = now() + interval '1 day', last_result = 'freeze', last_seen_at = now();
        
        insert into user_events (user_id, word_id, mode, event_type)
        values (p_user_id, p_word_id, p_mode, 'freeze');
        return;
    end if;

    -- Map result to FSRS grade
    v_grade := case p_result
        when 'success' then 3 -- good
        when 'fail' then 1     -- again
        else 1
    end;

    select * into v_status
    from user_word_status
    where user_id = p_user_id and word_id = p_word_id and mode = p_mode;

    v_params := fsrs6_parameters();
    select coalesce(target_retention, 0.9) into v_target
    from user_settings where user_id = p_user_id;

    v_review_type := case when v_status.word_id is null then 'new' else 'review' end;
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

    insert into user_word_status (
        user_id, word_id, mode,
        fsrs_stability, fsrs_difficulty, fsrs_reps, fsrs_lapses, fsrs_last_grade,
        fsrs_last_interval, fsrs_target_retention, fsrs_params_version, fsrs_enabled,
        next_review_at, last_result, last_seen_at,
        click_count, seen_count
    )
    values (
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
        coalesce(v_status.click_count, 0),
        coalesce(v_status.seen_count, 0) + 1
    )
    on conflict (user_id, word_id, mode) do update
    set fsrs_stability = excluded.fsrs_stability,
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

    insert into user_review_log (
        user_id, word_id, mode, grade, review_type,
        scheduled_at, reviewed_at,
        stability_before, difficulty_before,
        stability_after, difficulty_after,
        interval_after, params_version
    ) values (
        p_user_id, p_word_id, p_mode, v_grade, v_review_type,
        v_scheduled, now(),
        v_status.fsrs_stability, v_status.fsrs_difficulty,
        (v_compute->>'stability')::numeric,
        (v_compute->>'difficulty')::numeric,
        v_interval,
        'fsrs-6-default'
    );

    insert into user_events (user_id, word_id, mode, event_type)
    values (p_user_id, p_word_id, p_mode, 'review_' || p_result);
end;
$$;

-- Clicks are treated as lapses (grade=1) and scheduled accordingly
create or replace function handle_click(
    p_user_id uuid,
    p_word_id uuid,
    p_mode text
)
returns void
language plpgsql
security definer
as $$
declare
    v_status user_word_status%rowtype;
    v_params numeric[];
    v_target numeric;
    v_compute jsonb;
    v_interval numeric;
begin
    insert into user_events (user_id, word_id, mode, event_type)
    values (p_user_id, p_word_id, p_mode, 'definition_click');

    select * into v_status
    from user_word_status
    where user_id = p_user_id and word_id = p_word_id and mode = p_mode;

    v_params := fsrs6_parameters();
    select coalesce(target_retention, 0.9) into v_target
    from user_settings where user_id = p_user_id;

    v_compute := fsrs6_compute(
        v_status.fsrs_stability,
        v_status.fsrs_difficulty,
        v_status.last_seen_at,
        1,           -- grade = again
        v_target,
        v_status.fsrs_reps,
        v_status.fsrs_lapses,
        v_params
    );

    v_interval := (v_compute->>'interval')::numeric;

    insert into user_word_status (
        user_id, word_id, mode,
        fsrs_stability, fsrs_difficulty, fsrs_reps, fsrs_lapses, fsrs_last_grade,
        fsrs_last_interval, fsrs_target_retention, fsrs_params_version, fsrs_enabled,
        next_review_at, last_result, last_seen_at,
        click_count, seen_count
    )
    values (
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
        coalesce(v_status.click_count, 0) + 1,
        coalesce(v_status.seen_count, 0)
    )
    on conflict (user_id, word_id, mode) do update
    set fsrs_stability = excluded.fsrs_stability,
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
        click_count = user_word_status.click_count + 1;

    insert into user_review_log (
        user_id, word_id, mode, grade, review_type,
        scheduled_at, reviewed_at,
        stability_before, difficulty_before,
        stability_after, difficulty_after,
        interval_after, params_version, metadata
    ) values (
        p_user_id, p_word_id, p_mode, 1, 'click',
        v_status.next_review_at, now(),
        v_status.fsrs_stability, v_status.fsrs_difficulty,
        (v_compute->>'stability')::numeric,
        (v_compute->>'difficulty')::numeric,
        v_interval,
        'fsrs-6-default',
        jsonb_build_object('click', true)
    );
end;
$$;

-- Next card selector honoring FSRS due order and daily limits
create or replace function get_next_word(
    p_user_id uuid,
    p_mode text,
    p_exclude_ids uuid[] default array[]::uuid[]
)
returns setof jsonb
language plpgsql
security definer
as $$
declare
    v_word_id uuid;
    v_source text;
    v_overdue_count int;
    v_settings record;
    v_reviews_today int;
    v_new_today int;
begin
    select *
    into v_settings
    from user_settings
    where user_id = p_user_id;

    v_settings.daily_new_limit := coalesce(v_settings.daily_new_limit, 10);
    v_settings.daily_review_limit := coalesce(v_settings.daily_review_limit, 40);
    v_settings.mix_mode := coalesce(v_settings.mix_mode, 'mixed');

    select count(*) into v_reviews_today
    from user_review_log
    where user_id = p_user_id
      and mode = p_mode
      and review_type in ('review', 'click')
      and reviewed_at::date = current_date;

    select count(*) into v_new_today
    from user_review_log
    where user_id = p_user_id
      and mode = p_mode
      and review_type = 'new'
      and reviewed_at::date = current_date;

    select count(*) into v_overdue_count
    from user_word_status s
    join word_entries w on w.id = s.word_id
    where s.user_id = p_user_id 
      and s.mode = p_mode
      and s.next_review_at <= now()
      and (s.frozen_until is null or s.frozen_until <= now())
      and s.hidden = false
      and w.is_nt2_2000 = true
      and s.fsrs_enabled = true;

    -- Priority 1: overdue reviews if quota allows
    if v_reviews_today < v_settings.daily_review_limit then
        select s.word_id, 'review' into v_word_id, v_source
        from user_word_status s
        join word_entries w on w.id = s.word_id
        where s.user_id = p_user_id 
          and s.mode = p_mode
          and s.next_review_at <= now()
          and (s.frozen_until is null or s.frozen_until <= now())
          and s.hidden = false
          and s.fsrs_enabled = true
          and w.is_nt2_2000 = true
          and not (s.word_id = any(p_exclude_ids))
        order by s.next_review_at asc
        limit 1;
    end if;

    -- Priority 2: new card if review queue empty or quota exceeded
    if v_word_id is null and v_new_today < v_settings.daily_new_limit then
        select id, 'new' into v_word_id, v_source
        from word_entries w
        where w.is_nt2_2000 = true
          and not exists (
              select 1 from user_word_status s 
              where s.word_id = w.id 
                and s.user_id = p_user_id 
                and s.mode = p_mode
          )
          and not (w.id = any(p_exclude_ids))
        order by random()
        limit 1;
    end if;

    if v_word_id is not null then
        return query
        select jsonb_build_object(
            'id', w.id,
            'headword', w.headword,
            'part_of_speech', w.part_of_speech,
            'gender', w.gender,
            'raw', w.raw,
            'vandaleId', w.vandale_id,
            'is_nt2_2000', w.is_nt2_2000,
            'stats', jsonb_build_object(
                'source', v_source,
                'next_review', s.next_review_at,
                'interval', s.fsrs_last_interval,
                'reps', s.fsrs_reps,
                'stability', s.fsrs_stability,
                'difficulty', s.fsrs_difficulty,
                'clicks', s.click_count,
                'overdue_count', v_overdue_count,
                'reason', v_source,
                'reviews_today', v_reviews_today,
                'new_today', v_new_today,
                'daily_new_limit', v_settings.daily_new_limit,
                'daily_review_limit', v_settings.daily_review_limit
            )
        )
        from word_entries w
        left join user_word_status s on s.word_id = w.id and s.user_id = p_user_id and s.mode = p_mode
        where w.id = v_word_id;
    end if;

    return;
end;
$$;

-- Training stats using FSRS logs
create or replace function get_training_stats(p_user_id UUID, p_mode TEXT)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    v_today_count INT;
    v_total_success INT;
    v_total_items INT;
BEGIN
    select count(*) into v_today_count
    from user_review_log
    where user_id = p_user_id
      and mode = p_mode
      and reviewed_at::date = current_date;

    select count(*) into v_total_success
    from user_word_status
    where user_id = p_user_id
      and mode = p_mode
      and fsrs_enabled = true;

    select count(*) into v_total_items
    from word_entries
    where is_nt2_2000 = true;

    return jsonb_build_object(
        'today', v_today_count,
        'totalSuccess', v_total_success,
        'totalItems', v_total_items
    );
END;
$$;
