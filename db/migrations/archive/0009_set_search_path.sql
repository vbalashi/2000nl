-- Pin search_path on security definer and other functions to avoid hijacking.

-- Function: Handle Review (SM2 Logic)
create or replace function handle_review(
    p_user_id uuid,
    p_word_id uuid,
    p_mode text,
    p_result text -- 'success', 'fail', 'freeze', 'hide'
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_n int;
    v_ef float;
    v_interval int;
    v_status user_word_status%rowtype;
    v_new_interval int;
    v_new_n int;
    v_new_ef float;
    v_next_review timestamptz;
begin
    -- 1. Fetch existing status or default
    select * into v_status from user_word_status 
    where user_id = p_user_id and word_id = p_word_id and mode = p_mode;
    
    if not found then
        v_n := 0;
        v_ef := 2.5;
        v_interval := 0;
    else
        v_n := v_status.sm2_n;
        v_ef := v_status.sm2_ef;
        v_interval := v_status.sm2_interval;
    end if;

    -- 2. Handle simple states
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

    -- 3. SM2 Algorithm
    if p_result = 'success' then
        if v_n = 0 then
            v_new_interval := 1;
        elseif v_n = 1 then
            v_new_interval := 6;
        else
            v_new_interval := ceil(v_interval * v_ef);
        end if;
        v_new_n := v_n + 1;
        v_new_ef := v_ef; 
    else -- fail
        v_new_n := 0;
        v_new_interval := 1; -- Reset to 1 day
        v_new_ef := greatest(1.3, v_status.sm2_ef - 0.2); -- Simplify penalty
    end if;

    v_next_review := now() + (v_new_interval || ' days')::interval;

    -- 4. Upsert Status
    insert into user_word_status (
        user_id, word_id, mode, 
        sm2_n, sm2_ef, sm2_interval, next_review_at, 
        last_result, last_seen_at, success_count
    )
    values (
        p_user_id, p_word_id, p_mode,
        v_new_n, v_new_ef, v_new_interval, v_next_review,
        p_result, now(), 
        case when p_result = 'success' then 1 else 0 end
    )
    on conflict (user_id, word_id, mode) do update
    set sm2_n = excluded.sm2_n,
        sm2_ef = excluded.sm2_ef,
        sm2_interval = excluded.sm2_interval,
        next_review_at = excluded.next_review_at,
        last_result = excluded.last_result,
        last_seen_at = excluded.last_seen_at,
        success_count = user_word_status.success_count + (case when p_result = 'success' then 1 else 0 end);

    -- 5. Log Event
    insert into user_events (user_id, word_id, mode, event_type)
    values (p_user_id, p_word_id, p_mode, 'review_' || p_result);
end;
$$;


-- Function: Handle Click (Implicit "Forgot")
create or replace function handle_click(
    p_user_id uuid,
    p_word_id uuid,
    p_mode text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_status user_word_status%rowtype;
    v_new_ef float;
begin
    -- Record click event
    insert into user_events (user_id, word_id, mode, event_type)
    values (p_user_id, p_word_id, p_mode, 'definition_click');

    -- Update status
    select * into v_status from user_word_status 
    where user_id = p_user_id and word_id = p_word_id and mode = p_mode;

    if not found then
        -- First time seeing/interacting -> just initialize high priority
        insert into user_word_status (
            user_id, word_id, mode, 
            click_count, next_review_at, sm2_interval, sm2_n, sm2_ef
        ) values (
            p_user_id, p_word_id, p_mode, 
            1, now(), 0, 0, 2.5
        );
    else
        v_new_ef := greatest(1.3, v_status.sm2_ef - 0.15); -- Penalize EF
        
        update user_word_status
        set click_count = click_count + 1,
            next_review_at = now(), -- Review immediately!
            sm2_interval = 0,       -- Reset interval
            sm2_n = 0,              -- Reset reps
            sm2_ef = v_new_ef
        where user_id = p_user_id and word_id = p_word_id and mode = p_mode;
    end if;
end;
$$;


-- Function: Get Training Stats
create or replace function get_training_stats(p_user_id uuid, p_mode text)
returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
    v_today_count int;
    v_total_success int;
    v_total_items int;
begin
    -- 1. Count reviews done today (since midnight)
    select count(*)
    into v_today_count
    from user_events
    where user_id = p_user_id
      and mode = p_mode
      and event_type = 'review'
      and created_at >= current_date;

    -- 2. Count distinct words that have been successfully reviewed
    select count(*)
    into v_total_success
    from user_word_status
    where user_id = p_user_id
      and mode = p_mode
      and (sm2_interval > 0 or seen_count > 0);

    -- 3. Count total words in the system (nt2_2000)
    select count(*)
    into v_total_items
    from word_entries
    where is_nt2_2000 = true;

    return jsonb_build_object(
        'today', v_today_count,
        'totalSuccess', v_total_success,
        'totalItems', v_total_items
    );
end;
$$;


-- Function: Get Next Word (with meanings_count and debug stats)
create or replace function get_next_word(
    p_user_id uuid,
    p_mode text,
    p_exclude_ids uuid[] default array[]::uuid[]
)
returns setof jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_word_id uuid;
    v_source text;
    v_overdue_count int;
begin
    -- 0. Calculate Debug Stats
    select count(*) into v_overdue_count
    from user_word_status s
    join word_entries w on w.id = s.word_id
    where s.user_id = p_user_id 
      and s.mode = p_mode
      and s.next_review_at <= now()
      and (s.frozen_until is null or s.frozen_until <= now())
      and s.hidden = false
      and w.is_nt2_2000 = true;

    -- Priority 1: Overdue reviews
    select s.word_id, 'review' into v_word_id, v_source
    from user_word_status s
    join word_entries w on w.id = s.word_id
    where s.user_id = p_user_id 
      and s.mode = p_mode
      and s.next_review_at <= now()
      and (s.frozen_until is null or s.frozen_until <= now())
      and s.hidden = false
      and w.is_nt2_2000 = true
      and not (s.word_id = any(p_exclude_ids))
    order by s.next_review_at asc
    limit 1;

    -- Priority 2: New words
    if v_word_id is null then
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

    -- Return joined data
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
            'meanings_count', (select count(*) from word_entries sub where sub.headword = w.headword),
            'stats', jsonb_build_object(
                'source', v_source,
                'next_review', s.next_review_at,
                'interval', s.sm2_interval,
                'reps', s.sm2_n,
                'ef', s.sm2_ef,
                'clicks', s.click_count,
                'overdue_count', v_overdue_count,
                'reason', v_source
            )
        )
        from word_entries w
        left join user_word_status s on s.word_id = w.id and s.user_id = p_user_id and s.mode = p_mode
        where w.id = v_word_id;
    end if;
    
    return;
end;
$$;
