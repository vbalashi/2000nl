-- Adjust defaults for daily limits: no cap on reviews, keep 10 new/day

-- Remove default review cap and set existing rows to unlimited (NULL)
alter table user_settings
    alter column daily_review_limit drop default;

update user_settings
set daily_review_limit = null;

-- Recreate get_next_word to treat NULL as unlimited reviews and enforce only new-card cap by default
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
    -- daily_review_limit may be NULL to indicate unlimited

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

    -- Priority 1: overdue reviews; unlimited unless a cap is explicitly set
    if v_settings.daily_review_limit is null or v_reviews_today < v_settings.daily_review_limit then
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
