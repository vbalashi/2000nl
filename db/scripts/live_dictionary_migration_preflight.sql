\set ON_ERROR_STOP on

-- Live dictionary migration preflight.
-- Run before applying the dictionary/list/card/user-dictionary migration chain
-- to a production-like Supabase project.

select now() as checked_at, current_database() as database_name;

select count(*) as auth_users from auth.users;
select count(*) as user_settings from public.user_settings;
select count(*) as user_review_log from public.user_review_log;
select count(*) as user_word_lists from public.user_word_lists;
select count(*) as user_word_list_items from public.user_word_list_items;

do $$
declare
  v_problem text;
  v_count bigint;
begin
  if to_regclass('public.user_word_status') is not null then
    execute 'select count(*) from public.user_word_status' into v_count;
    raise notice 'legacy_user_word_status=%', v_count;
  else
    raise notice 'legacy_user_word_status table is absent';
  end if;

  if to_regclass('public.user_card_status') is not null then
    execute 'select count(*) from public.user_card_status' into v_count;
    raise notice 'user_card_status=%', v_count;
  else
    raise notice 'user_card_status table is absent';
  end if;

  if to_regclass('public.user_word_status') is not null then
    select string_agg(
      format('user_id=%s word_id=%s mode=%s count=%s', user_id, word_id, mode, duplicate_count),
      E'\n'
    )
    into v_problem
    from (
      select user_id, word_id, mode, count(*) as duplicate_count
      from public.user_word_status
      group by user_id, word_id, mode
      having count(*) > 1
      order by duplicate_count desc, user_id, word_id, mode
      limit 20
    ) duplicates;

    if v_problem is not null then
      raise exception 'duplicate legacy user_word_status keys:%', E'\n' || v_problem;
    end if;
  end if;

  if to_regclass('public.user_card_status') is not null then
    select string_agg(
      format('user_id=%s entry_id=%s card_type_id=%s count=%s', user_id, entry_id, card_type_id, duplicate_count),
      E'\n'
    )
    into v_problem
    from (
      select user_id, entry_id, card_type_id, count(*) as duplicate_count
      from public.user_card_status
      group by user_id, entry_id, card_type_id
      having count(*) > 1
      order by duplicate_count desc, user_id, entry_id, card_type_id
      limit 20
    ) duplicates;

    if v_problem is not null then
      raise exception 'duplicate user_card_status keys:%', E'\n' || v_problem;
    end if;
  end if;

  select string_agg(format('list_id=%s word_id=%s', list_id, word_id), E'\n' order by list_id, word_id)
  into v_problem
  from (
    select item.list_id, item.word_id
    from public.user_word_list_items item
    left join public.user_word_lists list on list.id = item.list_id
    where list.id is null
    order by item.list_id, item.word_id
    limit 20
  ) orphan_items;

  if v_problem is not null then
    raise exception 'orphan user_word_list_items:%', E'\n' || v_problem;
  end if;

  select string_agg(format('list_id=%s word_id=%s', list_id, word_id), E'\n' order by list_id, word_id)
  into v_problem
  from (
    select item.list_id, item.word_id
    from public.user_word_list_items item
    left join public.word_entries entry on entry.id = item.word_id
    where entry.id is null
    order by item.list_id, item.word_id
    limit 20
  ) missing_entry_items;

  if v_problem is not null then
    raise exception 'user_word_list_items reference missing word_entries:%', E'\n' || v_problem;
  end if;
end $$;

select 'live_dictionary_migration_preflight' as check_name, 'ok' as value;
