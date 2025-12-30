-- Introduce a short intraday learning step before graduating a new card to FSRS.
-- Adds learning state columns, optional settings, and updates handle_review/get_next_word.

-- 1) Schema: learning state per card
alter table if exists user_word_status
    add column if not exists in_learning boolean default false,
    add column if not exists learning_due_at timestamptz;

-- 2) Settings: feature flag and step durations (minutes)
alter table if exists user_settings
    add column if not exists enable_learning_step boolean default true,
    add column if not exists learning_step_minutes int default 15,
    add column if not exists learning_again_minutes int default 5;

-- 3) handle_review with intraday learning step
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
    v_learning_enabled boolean;
    v_learning_step interval;
    v_learning_again interval;
    v_is_new boolean;
begin
    -- Non-review states
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

    select
        coalesce(enable_learning_step, true),
        make_interval(mins => coalesce(learning_step_minutes, 15)),
        make_interval(mins => coalesce(learning_again_minutes, 5)),
        coalesce(target_retention, 0.9)
    into v_learning_enabled, v_learning_step, v_learning_again, v_target
    from user_settings
    where user_id = p_user_id;

    v_learning_enabled := coalesce(v_learning_enabled, true);
    v_learning_step := coalesce(v_learning_step, interval '15 minutes');
    v_learning_again := coalesce(v_learning_again, interval '5 minutes');
    v_target := coalesce(v_target, 0.9);

    v_is_new := v_status.word_id is null;

    v_params := fsrs6_parameters();

    -- Learning-step handling
    if v_learning_enabled then
        -- First-ever review: place into intraday learning
        if v_is_new and not coalesce(v_status.in_learning, false) then
            if p_result = 'fail' then
                v_interval := extract(epoch from v_learning_again) / 86400.0;
                insert into user_word_status (
                    user_id, word_id, mode,
                    in_learning, learning_due_at, next_review_at,
                    last_result, last_seen_at,
                    seen_count, click_count,
                    hidden, frozen_until, fsrs_enabled
                ) values (
                    p_user_id, p_word_id, p_mode,
                    true, now() + v_learning_again, now() + v_learning_again,
                    p_result, now(),
                    coalesce(v_status.seen_count, 0) + 1,
                    coalesce(v_status.click_count, 0),
                    coalesce(v_status.hidden, false),
                    v_status.frozen_until,
                    false
                )
                on conflict (user_id, word_id, mode) do update
                set in_learning = true,
                    learning_due_at = now() + v_learning_again,
                    next_review_at = now() + v_learning_again,
                    last_result = excluded.last_result,
                    last_seen_at = excluded.last_seen_at,
                    seen_count = user_word_status.seen_count + 1;

                insert into user_events (user_id, word_id, mode, event_type)
                values (p_user_id, p_word_id, p_mode, 'review_fail');

                insert into user_review_log (
                    user_id, word_id, mode, grade, review_type,
                    scheduled_at, reviewed_at,
                    stability_before, difficulty_before,
                    stability_after, difficulty_after,
                    interval_after, params_version
                ) values (
                    p_user_id, p_word_id, p_mode, v_grade, 'learning',
                    null, now(),
                    v_status.fsrs_stability, v_status.fsrs_difficulty,
                    null, null,
                    v_interval,
                    'fsrs-6-default'
                );
                return;
            else
                v_interval := extract(epoch from v_learning_step) / 86400.0;
                insert into user_word_status (
                    user_id, word_id, mode,
                    in_learning, learning_due_at, next_review_at,
                    last_result, last_seen_at,
                    seen_count, click_count,
                    hidden, frozen_until, fsrs_enabled
                ) values (
                    p_user_id, p_word_id, p_mode,
                    true, now() + v_learning_step, now() + v_learning_step,
                    p_result, now(),
                    coalesce(v_status.seen_count, 0) + 1,
                    coalesce(v_status.click_count, 0),
                    coalesce(v_status.hidden, false),
                    v_status.frozen_until,
                    false
                )
                on conflict (user_id, word_id, mode) do update
                set in_learning = true,
                    learning_due_at = now() + v_learning_step,
                    next_review_at = now() + v_learning_step,
                    last_result = excluded.last_result,
                    last_seen_at = excluded.last_seen_at,
                    seen_count = user_word_status.seen_count + 1;

                insert into user_events (user_id, word_id, mode, event_type)
                values (p_user_id, p_word_id, p_mode, 'review_' || p_result);

                insert into user_review_log (
                    user_id, word_id, mode, grade, review_type,
                    scheduled_at, reviewed_at,
                    stability_before, difficulty_before,
                    stability_after, difficulty_after,
                    interval_after, params_version
                ) values (
                    p_user_id, p_word_id, p_mode, v_grade, 'learning',
                    null, now(),
                    v_status.fsrs_stability, v_status.fsrs_difficulty,
                    null, null,
                    v_interval,
                    'fsrs-6-default'
                );
                return;
            end if;
        end if;

        -- Continue learning: due short retry or graduate to FSRS
        if coalesce(v_status.in_learning, false) then
            if p_result = 'fail' then
                v_interval := extract(epoch from v_learning_again) / 86400.0;
                update user_word_status
                set in_learning = true,
                    learning_due_at = now() + v_learning_again,
                    next_review_at = now() + v_learning_again,
                    last_result = 'fail',
                    last_seen_at = now(),
                    seen_count = coalesce(seen_count, 0) + 1
                where user_id = p_user_id and word_id = p_word_id and mode = p_mode;

                insert into user_events (user_id, word_id, mode, event_type)
                values (p_user_id, p_word_id, p_mode, 'review_fail');

                insert into user_review_log (
                    user_id, word_id, mode, grade, review_type,
                    scheduled_at, reviewed_at,
                    stability_before, difficulty_before,
                    stability_after, difficulty_after,
                    interval_after, params_version
                ) values (
                    p_user_id, p_word_id, p_mode, v_grade, 'learning',
                    v_status.learning_due_at, now(),
                    v_status.fsrs_stability, v_status.fsrs_difficulty,
                    null, null,
                    v_interval,
                    'fsrs-6-default'
                );
                return;
            end if;

            -- Graduate to FSRS after successful intraday review
            v_review_type := 'new';
            v_scheduled := v_status.learning_due_at;

            v_compute := fsrs6_compute(
                null,
                null,
                v_status.last_seen_at,
                v_grade,
                v_target,
                null,
                null,
                v_params
            );

            v_interval := (v_compute->>'interval')::numeric;

            insert into user_word_status (
                user_id, word_id, mode,
                fsrs_stability, fsrs_difficulty, fsrs_reps, fsrs_lapses, fsrs_last_grade,
                fsrs_last_interval, fsrs_target_retention, fsrs_params_version, fsrs_enabled,
                next_review_at, last_result, last_seen_at,
                click_count, seen_count,
                in_learning, learning_due_at,
                hidden, frozen_until
            ) values (
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
                coalesce(v_status.seen_count, 0) + 1,
                false,
                null,
                coalesce(v_status.hidden, false),
                v_status.frozen_until
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
                seen_count = user_word_status.seen_count + 1,
                in_learning = false,
                learning_due_at = null;

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
            return;
        end if;
    end if;

    -- Standard FSRS path (reviews or learning disabled)
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
        click_count, seen_count,
        in_learning, learning_due_at
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
        coalesce(v_status.seen_count, 0) + 1,
        false,
        null
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
        seen_count = user_word_status.seen_count + 1,
        in_learning = false,
        learning_due_at = null;

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

-- 4) get_next_word with learning priority
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

    -- Priority 0: learning due now
    select s.word_id, 'learning' into v_word_id, v_source
    from user_word_status s
    join word_entries w on w.id = s.word_id
    where s.user_id = p_user_id
      and s.mode = p_mode
      and s.in_learning = true
      and s.learning_due_at <= now()
      and (s.frozen_until is null or s.frozen_until <= now())
      and s.hidden = false
      and w.is_nt2_2000 = true
      and not (s.word_id = any(p_exclude_ids))
    order by s.learning_due_at asc
    limit 1;

    -- Priority 1: overdue reviews (FSRS), unlimited unless a cap exists
    if v_word_id is null and (v_settings.daily_review_limit is null or v_reviews_today < v_settings.daily_review_limit) then
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

    -- Priority 2: new card if none selected and within new-card cap
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
                'daily_review_limit', v_settings.daily_review_limit,
                'learning_due_at', s.learning_due_at
            )
        )
        from word_entries w
        left join user_word_status s on s.word_id = w.id and s.user_id = p_user_id and s.mode = p_mode
        where w.id = v_word_id;
    end if;

    return;
end;
$$;
