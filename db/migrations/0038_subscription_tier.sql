-- Add subscription tier to user_settings and create gated RPCs for word queries
-- Free tier users can only access first 100 words (by rank for curated lists, by headword for global search)

-- 1) Add subscription_tier column
alter table if exists user_settings
    add column if not exists subscription_tier text default 'free'
    check (subscription_tier in ('free', 'premium', 'admin'));

comment on column user_settings.subscription_tier is 'User subscription tier: free (100 word limit), premium (full access), admin (full access)';

-- 2) Helper function to get user tier
create or replace function get_user_tier(p_user_id uuid)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
stable
as $$
declare
    v_tier text;
begin
    select coalesce(subscription_tier, 'free')
    into v_tier
    from user_settings
    where user_id = p_user_id;
    
    return coalesce(v_tier, 'free');
end;
$$;

-- 3) Gated word search (global search with 100 word limit for free users)
create or replace function search_word_entries_gated(
    p_query text default null,
    p_part_of_speech text default null,
    p_is_nt2 boolean default null,
    p_filter_frozen boolean default null,
    p_filter_hidden boolean default null,
    p_page int default 1,
    p_page_size int default 20
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
stable
as $$
declare
    v_user_id uuid;
    v_tier text;
    v_offset int;
    v_limit int;
    v_total int;
    v_max_allowed int;
    v_is_locked boolean;
    v_items jsonb;
begin
    -- Get current user
    v_user_id := auth.uid();
    if v_user_id is null then
        return jsonb_build_object(
            'items', '[]'::jsonb,
            'total', 0,
            'is_locked', true,
            'max_allowed', 0
        );
    end if;
    
    -- Get user tier
    v_tier := get_user_tier(v_user_id);
    v_max_allowed := case when v_tier in ('premium', 'admin') then null else 100 end;
    
    -- Calculate pagination
    v_offset := (p_page - 1) * p_page_size;
    v_limit := p_page_size;
    
    -- Get total count (respecting filters)
    select count(*)
    into v_total
    from word_entries w
    where (p_query is null or w.headword ilike '%' || p_query || '%')
      and (p_part_of_speech is null or w.part_of_speech = p_part_of_speech)
      and (p_is_nt2 is null or w.is_nt2_2000 = p_is_nt2)
      and (
        p_filter_hidden is null
        or p_filter_hidden = false
        or exists (
          select 1
          from user_word_status s
          where s.user_id = v_user_id
            and s.word_id = w.id
            and coalesce(s.hidden, false) = true
        )
      )
      and (
        p_filter_frozen is null
        or p_filter_frozen = false
        or exists (
          select 1
          from user_word_status s
          where s.user_id = v_user_id
            and s.word_id = w.id
            and s.frozen_until is not null
            and s.frozen_until > now()
        )
      );
    
    -- Determine if results are locked (free user trying to access beyond 100)
    v_is_locked := v_max_allowed is not null and (v_offset >= v_max_allowed);
    
    -- If locked, return empty items but with metadata
    if v_is_locked then
        return jsonb_build_object(
            'items', '[]'::jsonb,
            'total', v_total,
            'is_locked', true,
            'max_allowed', v_max_allowed
        );
    end if;
    
    -- Adjust limit if approaching the cap
    if v_max_allowed is not null and (v_offset + v_limit) > v_max_allowed then
        v_limit := v_max_allowed - v_offset;
    end if;
    
    -- Fetch items (ordered by headword for global search)
    select coalesce(jsonb_agg(row_to_json(t)::jsonb), '[]'::jsonb)
    into v_items
    from (
        select 
            w.id,
            w.headword,
            w.part_of_speech,
            w.gender,
            w.raw,
            w.is_nt2_2000
        from word_entries w
        where (p_query is null or w.headword ilike '%' || p_query || '%')
          and (p_part_of_speech is null or w.part_of_speech = p_part_of_speech)
          and (p_is_nt2 is null or w.is_nt2_2000 = p_is_nt2)
          and (
            p_filter_hidden is null
            or p_filter_hidden = false
            or exists (
              select 1
              from user_word_status s
              where s.user_id = v_user_id
                and s.word_id = w.id
                and coalesce(s.hidden, false) = true
            )
          )
          and (
            p_filter_frozen is null
            or p_filter_frozen = false
            or exists (
              select 1
              from user_word_status s
              where s.user_id = v_user_id
                and s.word_id = w.id
                and s.frozen_until is not null
                and s.frozen_until > now()
            )
          )
        order by w.headword asc
        offset v_offset
        limit v_limit
    ) t;
    
    return jsonb_build_object(
        'items', v_items,
        'total', v_total,
        'is_locked', v_max_allowed is not null and v_total > v_max_allowed,
        'max_allowed', v_max_allowed
    );
end;
$$;

-- 4) Gated fetch for curated/user lists (100 word limit by rank for free users)
create or replace function fetch_words_for_list_gated(
    p_list_id uuid,
    p_list_type text default 'curated',
    p_query text default null,
    p_part_of_speech text default null,
    p_is_nt2 boolean default null,
    p_filter_frozen boolean default null,
    p_filter_hidden boolean default null,
    p_page int default 1,
    p_page_size int default 20
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
stable
as $$
declare
    v_user_id uuid;
    v_tier text;
    v_offset int;
    v_limit int;
    v_total int;
    v_max_allowed int;
    v_is_locked boolean;
    v_items jsonb;
begin
    -- Get current user
    v_user_id := auth.uid();
    if v_user_id is null then
        return jsonb_build_object(
            'items', '[]'::jsonb,
            'total', 0,
            'is_locked', true,
            'max_allowed', 0
        );
    end if;
    
    -- Get user tier
    v_tier := get_user_tier(v_user_id);
    v_max_allowed := case when v_tier in ('premium', 'admin') then null else 100 end;
    
    -- Calculate pagination
    v_offset := (p_page - 1) * p_page_size;
    v_limit := p_page_size;
    
    -- Get total count based on list type
    if p_list_type = 'curated' then
        select count(*)
        into v_total
        from word_entries w
        join word_list_items li on li.word_id = w.id
        where li.list_id = p_list_id
          and (p_query is null or w.headword ilike '%' || p_query || '%')
          and (p_part_of_speech is null or w.part_of_speech = p_part_of_speech)
          and (p_is_nt2 is null or w.is_nt2_2000 = p_is_nt2)
          and (
            p_filter_hidden is null
            or p_filter_hidden = false
            or exists (
              select 1
              from user_word_status s
              where s.user_id = v_user_id
                and s.word_id = w.id
                and coalesce(s.hidden, false) = true
            )
          )
          and (
            p_filter_frozen is null
            or p_filter_frozen = false
            or exists (
              select 1
              from user_word_status s
              where s.user_id = v_user_id
                and s.word_id = w.id
                and s.frozen_until is not null
                and s.frozen_until > now()
            )
          );
    else
        -- User list - verify ownership
        if not exists (
            select 1 from user_word_lists
            where id = p_list_id and user_id = v_user_id
        ) then
            return jsonb_build_object(
                'items', '[]'::jsonb,
                'total', 0,
                'is_locked', false,
                'max_allowed', v_max_allowed
            );
        end if;
        
        select count(*)
        into v_total
        from word_entries w
        join user_word_list_items li on li.word_id = w.id
        where li.list_id = p_list_id
          and (p_query is null or w.headword ilike '%' || p_query || '%')
          and (p_part_of_speech is null or w.part_of_speech = p_part_of_speech)
          and (p_is_nt2 is null or w.is_nt2_2000 = p_is_nt2)
          and (
            p_filter_hidden is null
            or p_filter_hidden = false
            or exists (
              select 1
              from user_word_status s
              where s.user_id = v_user_id
                and s.word_id = w.id
                and coalesce(s.hidden, false) = true
            )
          )
          and (
            p_filter_frozen is null
            or p_filter_frozen = false
            or exists (
              select 1
              from user_word_status s
              where s.user_id = v_user_id
                and s.word_id = w.id
                and s.frozen_until is not null
                and s.frozen_until > now()
            )
          );
    end if;
    
    -- Determine if results are locked
    v_is_locked := v_max_allowed is not null and (v_offset >= v_max_allowed);
    
    if v_is_locked then
        return jsonb_build_object(
            'items', '[]'::jsonb,
            'total', v_total,
            'is_locked', true,
            'max_allowed', v_max_allowed
        );
    end if;
    
    -- Adjust limit if approaching the cap
    if v_max_allowed is not null and (v_offset + v_limit) > v_max_allowed then
        v_limit := v_max_allowed - v_offset;
    end if;
    
    -- Fetch items based on list type
    if p_list_type = 'curated' then
        -- Order by rank if available, fallback to headword
        select coalesce(jsonb_agg(row_to_json(t)::jsonb order by t.sort_rank, t.headword), '[]'::jsonb)
        into v_items
        from (
            select 
                w.id,
                w.headword,
                w.part_of_speech,
                w.gender,
                w.raw,
                w.is_nt2_2000,
                coalesce(li.rank, 999999) as sort_rank
            from word_entries w
            join word_list_items li on li.word_id = w.id
            where li.list_id = p_list_id
              and (p_query is null or w.headword ilike '%' || p_query || '%')
              and (p_part_of_speech is null or w.part_of_speech = p_part_of_speech)
              and (p_is_nt2 is null or w.is_nt2_2000 = p_is_nt2)
              and (
                p_filter_hidden is null
                or p_filter_hidden = false
                or exists (
                  select 1
                  from user_word_status s
                  where s.user_id = v_user_id
                    and s.word_id = w.id
                    and coalesce(s.hidden, false) = true
                )
              )
              and (
                p_filter_frozen is null
                or p_filter_frozen = false
                or exists (
                  select 1
                  from user_word_status s
                  where s.user_id = v_user_id
                    and s.word_id = w.id
                    and s.frozen_until is not null
                    and s.frozen_until > now()
                )
              )
            order by coalesce(li.rank, 999999) asc, w.headword asc
            offset v_offset
            limit v_limit
        ) t;
    else
        -- User list - order by added_at desc, then headword
        select coalesce(jsonb_agg(row_to_json(t)::jsonb), '[]'::jsonb)
        into v_items
        from (
            select 
                w.id,
                w.headword,
                w.part_of_speech,
                w.gender,
                w.raw,
                w.is_nt2_2000
            from word_entries w
            join user_word_list_items li on li.word_id = w.id
            where li.list_id = p_list_id
              and (p_query is null or w.headword ilike '%' || p_query || '%')
              and (p_part_of_speech is null or w.part_of_speech = p_part_of_speech)
              and (p_is_nt2 is null or w.is_nt2_2000 = p_is_nt2)
              and (
                p_filter_hidden is null
                or p_filter_hidden = false
                or exists (
                  select 1
                  from user_word_status s
                  where s.user_id = v_user_id
                    and s.word_id = w.id
                    and coalesce(s.hidden, false) = true
                )
              )
              and (
                p_filter_frozen is null
                or p_filter_frozen = false
                or exists (
                  select 1
                  from user_word_status s
                  where s.user_id = v_user_id
                    and s.word_id = w.id
                    and s.frozen_until is not null
                    and s.frozen_until > now()
                )
              )
            order by li.added_at desc, w.headword asc
            offset v_offset
            limit v_limit
        ) t;
    end if;
    
    return jsonb_build_object(
        'items', v_items,
        'total', v_total,
        'is_locked', v_max_allowed is not null and v_total > v_max_allowed,
        'max_allowed', v_max_allowed
    );
end;
$$;

-- 5) Grant execute permissions
grant execute on function get_user_tier(uuid) to authenticated;
grant execute on function search_word_entries_gated(text, text, boolean, boolean, boolean, int, int) to authenticated;
grant execute on function fetch_words_for_list_gated(uuid, text, text, text, boolean, boolean, boolean, int, int) to authenticated;
