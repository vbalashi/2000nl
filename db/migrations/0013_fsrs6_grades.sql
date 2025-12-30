-- Allow richer grades (again/hard/good/easy) via handle_review

create or replace function handle_review(
    p_user_id uuid,
    p_word_id uuid,
    p_mode text,
    p_result text -- 'fail' (again), 'hard', 'success' (good), 'easy', 'freeze', 'hide'
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
        when 'fail' then 1
        when 'hard' then 2
        when 'success' then 3
        when 'easy' then 4
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
