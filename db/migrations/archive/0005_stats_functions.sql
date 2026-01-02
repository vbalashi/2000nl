-- Function to get comprehensive training stats for the user
CREATE OR REPLACE FUNCTION get_training_stats(p_user_id UUID, p_mode TEXT)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    v_today_count INT;
    v_total_success INT;
    v_total_items INT;
BEGIN
    -- 1. Count reviews done today (since midnight)
    SELECT COUNT(*)
    INTO v_today_count
    FROM user_events
    WHERE user_id = p_user_id
      AND mode = p_mode
      AND event_type = 'review'
      AND created_at >= CURRENT_DATE;

    -- 2. Count distinct words that have been successfully reviewed
    SELECT COUNT(*)
    INTO v_total_success
    FROM user_word_status
    WHERE user_id = p_user_id
      AND mode = p_mode
      AND (sm2_interval > 0 OR seen_count > 0);

    -- 3. Count total words in the system (nt2_2000)
    SELECT COUNT(*)
    INTO v_total_items
    FROM word_entries
    WHERE is_nt2_2000 = true;

    RETURN jsonb_build_object(
        'today', v_today_count,
        'totalSuccess', v_total_success,
        'totalItems', v_total_items
    );
END;
$$;


-- Function: Get Next Word (Enhanced with Debug Info)
-- Updated in 0005 to include debug stats
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
begin
    -- 0. Calculate Debug Stats: Count of overdue items (Filtered by 2k list to match review logic)
    select count(*) into v_overdue_count
    from user_word_status s
    join word_entries w on w.id = s.word_id
    where s.user_id = p_user_id 
      and s.mode = p_mode
      and s.next_review_at <= now()
      and (s.frozen_until is null or s.frozen_until <= now())
      and s.hidden = false
      and w.is_nt2_2000 = true; -- STRICT FILTER

    -- Priority 1: Overdue reviews (including clicked words set to now())
    -- STRICTLY ONLY 2000 WORDS
    select s.word_id, 'review' into v_word_id, v_source
    from user_word_status s
    join word_entries w on w.id = s.word_id
    where s.user_id = p_user_id 
      and s.mode = p_mode
      and s.next_review_at <= now()
      and (s.frozen_until is null or s.frozen_until <= now())
      and s.hidden = false
      and w.is_nt2_2000 = true -- STRICT FILTER
      and not (s.word_id = any(p_exclude_ids))
    order by s.next_review_at asc -- The most overdue first
    limit 1;

    -- Priority 2: If no overdue, pick a "New" word that is important
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

    -- If found, return joined data
    if v_word_id is not null then
        return query
        select jsonb_build_object(
            'id', w.id,
            'headword', w.headword,
            'part_of_speech', w.part_of_speech,
            'gender', w.gender,
            'raw', w.raw,
            'vandaleId', w.vandale_id,
            'is_nt2_2000', w.is_nt2_2000, -- Return this flag
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
