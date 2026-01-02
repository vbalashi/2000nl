-- User-owned word lists and list-aware training scope

-- Tables for user-created lists
create table if not exists user_word_lists (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    language_code text references languages(code),
    name text not null,
    description text,
    created_at timestamptz default now(),
    updated_at timestamptz default now(),
    unique (user_id, name)
);

create table if not exists user_word_list_items (
    list_id uuid not null references user_word_lists(id) on delete cascade,
    word_id uuid not null references word_entries(id) on delete cascade,
    added_at timestamptz default now(),
    primary key (list_id, word_id)
);

create index if not exists user_word_list_items_list_idx
    on user_word_list_items(list_id, word_id);

-- Track a user's active list selection (curated or user-owned)
alter table if exists user_settings
    add column if not exists active_list_id uuid,
    add column if not exists active_list_type text default 'curated' check (active_list_type in ('curated', 'user'));

-- RLS: users can only see and mutate their own lists/items
alter table if exists user_word_lists enable row level security;
alter table if exists user_word_list_items enable row level security;

do $$
begin
    if not exists (
        select 1 from pg_policies where schemaname = 'public' and tablename = 'user_word_lists' and policyname = 'select_own_user_word_lists'
    ) then
        create policy select_own_user_word_lists on user_word_lists
            for select
            using (auth.uid() = user_id);
    end if;

    if not exists (
        select 1 from pg_policies where schemaname = 'public' and tablename = 'user_word_lists' and policyname = 'insert_own_user_word_lists'
    ) then
        create policy insert_own_user_word_lists on user_word_lists
            for insert
            with check (auth.uid() = user_id);
    end if;

    if not exists (
        select 1 from pg_policies where schemaname = 'public' and tablename = 'user_word_lists' and policyname = 'update_own_user_word_lists'
    ) then
        create policy update_own_user_word_lists on user_word_lists
            for update
            using (auth.uid() = user_id)
            with check (auth.uid() = user_id);
    end if;

    if not exists (
        select 1 from pg_policies where schemaname = 'public' and tablename = 'user_word_lists' and policyname = 'delete_own_user_word_lists'
    ) then
        create policy delete_own_user_word_lists on user_word_lists
            for delete
            using (auth.uid() = user_id);
    end if;
end $$;

do $$
begin
    if not exists (
        select 1 from pg_policies where schemaname = 'public' and tablename = 'user_word_list_items' and policyname = 'select_items_for_owned_lists'
    ) then
        create policy select_items_for_owned_lists on user_word_list_items
            for select
            using (exists (
                select 1 from user_word_lists l
                where l.id = list_id
                  and l.user_id = auth.uid()
            ));
    end if;

    if not exists (
        select 1 from pg_policies where schemaname = 'public' and tablename = 'user_word_list_items' and policyname = 'insert_items_for_owned_lists'
    ) then
        create policy insert_items_for_owned_lists on user_word_list_items
            for insert
            with check (exists (
                select 1 from user_word_lists l
                where l.id = list_id
                  and l.user_id = auth.uid()
            ));
    end if;

    if not exists (
        select 1 from pg_policies where schemaname = 'public' and tablename = 'user_word_list_items' and policyname = 'delete_items_for_owned_lists'
    ) then
        create policy delete_items_for_owned_lists on user_word_list_items
            for delete
            using (exists (
                select 1 from user_word_lists l
                where l.id = list_id
                  and l.user_id = auth.uid()
            ));
    end if;
    if not exists (
        select 1 from pg_policies where schemaname = 'public' and tablename = 'user_word_list_items' and policyname = 'update_items_for_owned_lists'
    ) then
        create policy update_items_for_owned_lists on user_word_list_items
            for update
            using (exists (
                select 1 from user_word_lists l
                where l.id = list_id
                  and l.user_id = auth.uid()
            ))
            with check (exists (
                select 1 from user_word_lists l
                where l.id = list_id
                  and l.user_id = auth.uid()
            ));
    end if;
end $$;

-- List-aware training selector (curated or user lists)
create or replace function get_next_word(
    p_user_id uuid,
    p_mode text,
    p_exclude_ids uuid[] default array[]::uuid[],
    p_list_id uuid default null,
    p_list_type text default 'curated'
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
    v_list_valid boolean := true;
begin
    if p_list_id is not null then
        if p_list_type is null then
            p_list_type := 'curated';
        end if;

        if p_list_type = 'user' then
            select exists (
                select 1 from user_word_lists
                where id = p_list_id
                  and user_id = p_user_id
            ) into v_list_valid;
        else
            select exists (
                select 1 from word_lists
                where id = p_list_id
            ) into v_list_valid;
        end if;

        if not v_list_valid then
            return;
        end if;
    end if;

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
      and s.fsrs_enabled = true
      and (
            (p_list_id is null and w.is_nt2_2000 = true)
         or (p_list_id is not null and p_list_type = 'curated' and exists (
                select 1 from word_list_items li
                where li.list_id = p_list_id
                  and li.word_id = w.id
            ))
         or (p_list_id is not null and p_list_type = 'user' and exists (
                select 1 from user_word_list_items li
                join user_word_lists l on l.id = li.list_id
                where li.list_id = p_list_id
                  and li.word_id = w.id
                  and l.user_id = p_user_id
            ))
      );

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
          and not (s.word_id = any(p_exclude_ids))
          and (
                (p_list_id is null and w.is_nt2_2000 = true)
             or (p_list_id is not null and p_list_type = 'curated' and exists (
                    select 1 from word_list_items li
                    where li.list_id = p_list_id
                      and li.word_id = w.id
                ))
             or (p_list_id is not null and p_list_type = 'user' and exists (
                    select 1 from user_word_list_items li
                    join user_word_lists l on l.id = li.list_id
                    where li.list_id = p_list_id
                      and li.word_id = w.id
                      and l.user_id = p_user_id
                ))
          )
        order by s.next_review_at asc
        limit 1;
    end if;

    -- Priority 2: new card if review queue empty or quota exceeded
    if v_word_id is null and v_new_today < v_settings.daily_new_limit then
        select id, 'new' into v_word_id, v_source
        from word_entries w
        where not exists (
                select 1 from user_word_status s 
                where s.word_id = w.id 
                  and s.user_id = p_user_id 
                  and s.mode = p_mode
            )
          and not (w.id = any(p_exclude_ids))
          and (
                (p_list_id is null and w.is_nt2_2000 = true)
             or (p_list_id is not null and p_list_type = 'curated' and exists (
                    select 1 from word_list_items li
                    where li.list_id = p_list_id
                      and li.word_id = w.id
                ))
             or (p_list_id is not null and p_list_type = 'user' and exists (
                    select 1 from user_word_list_items li
                    join user_word_lists l on l.id = li.list_id
                    where li.list_id = p_list_id
                      and li.word_id = w.id
                      and l.user_id = p_user_id
                ))
          )
        order by random()
        limit 1;
    end if;

    -- Priority 3: practice mode fallback (keeps small lists from "sticking")
    -- If quotas are reached (or no due/new cards), pick any eligible word from the selected scope
    -- while still honoring exclude list and hidden/frozen flags.
    if v_word_id is null then
        select w.id, 'practice' into v_word_id, v_source
        from word_entries w
        left join user_word_status s
          on s.word_id = w.id
         and s.user_id = p_user_id
         and s.mode = p_mode
        where not (w.id = any(p_exclude_ids))
          and (s.hidden is null or s.hidden = false)
          and (s.frozen_until is null or s.frozen_until <= now())
          and (s.fsrs_enabled is null or s.fsrs_enabled = true)
          and (
                (p_list_id is null and w.is_nt2_2000 = true)
             or (p_list_id is not null and p_list_type = 'curated' and exists (
                    select 1 from word_list_items li
                    where li.list_id = p_list_id
                      and li.word_id = w.id
                ))
             or (p_list_id is not null and p_list_type = 'user' and exists (
                    select 1 from user_word_list_items li
                    join user_word_lists l on l.id = li.list_id
                    where li.list_id = p_list_id
                      and li.word_id = w.id
                      and l.user_id = p_user_id
                ))
          )
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

-- List-aware training stats
create or replace function get_training_stats(
    p_user_id UUID,
    p_mode TEXT,
    p_list_id uuid default null,
    p_list_type text default 'curated'
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    v_today_count INT;
    v_total_success INT;
    v_total_items INT;
begin
    if p_list_id is not null and p_list_type is null then
        p_list_type := 'curated';
    end if;

    select count(*) into v_today_count
    from user_review_log
    where user_id = p_user_id
      and mode = p_mode
      and reviewed_at::date = current_date;

    select count(*) into v_total_success
    from user_word_status s
    join word_entries w on w.id = s.word_id
    where s.user_id = p_user_id
      and s.mode = p_mode
      and s.fsrs_enabled = true
      and (
            (p_list_id is null and w.is_nt2_2000 = true)
         or (p_list_id is not null and p_list_type = 'curated' and exists (
                select 1 from word_list_items li
                where li.list_id = p_list_id
                  and li.word_id = w.id
            ))
         or (p_list_id is not null and p_list_type = 'user' and exists (
                select 1 from user_word_list_items li
                join user_word_lists l on l.id = li.list_id
                where li.list_id = p_list_id
                  and li.word_id = w.id
                  and l.user_id = p_user_id
            ))
      );

    select count(*) into v_total_items
    from word_entries w
    where (
            (p_list_id is null and w.is_nt2_2000 = true)
         or (p_list_id is not null and p_list_type = 'curated' and exists (
                select 1 from word_list_items li
                where li.list_id = p_list_id
                  and li.word_id = w.id
            ))
         or (p_list_id is not null and p_list_type = 'user' and exists (
                select 1 from user_word_list_items li
                join user_word_lists l on l.id = li.list_id
                where li.list_id = p_list_id
                  and li.word_id = w.id
                  and l.user_id = p_user_id
            ))
      );

    return jsonb_build_object(
        'today', v_today_count,
        'totalSuccess', v_total_success,
        'totalItems', v_total_items
    );
END;
$$;
