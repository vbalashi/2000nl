\set ON_ERROR_STOP on

select 'database' as check_name, current_database() as value;
select 'current_user' as check_name, current_user as value;

do $$
begin
  if not exists (select 1 from pg_namespace where nspname = 'auth') then
    raise exception 'missing Supabase auth schema';
  end if;

  if not exists (
    select 1
    from information_schema.tables
    where table_schema = 'auth' and table_name = 'users'
  ) then
    raise exception 'missing auth.users table';
  end if;

  if not exists (select 1 from pg_roles where rolname = 'anon') then
    raise exception 'missing anon role';
  end if;

  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    raise exception 'missing authenticated role';
  end if;

  if to_regprocedure('auth.uid()') is null then
    raise exception 'missing auth.uid()';
  end if;

  if to_regprocedure('public.get_next_word(uuid,text,uuid[],uuid,text)') is null then
    raise exception 'missing public.get_next_word(uuid,text,uuid[],uuid,text)';
  end if;

  if to_regprocedure('public.handle_review(uuid,uuid,text,text,uuid)') is null then
    raise exception 'missing public.handle_review(uuid,uuid,text,text,uuid)';
  end if;

  if to_regprocedure('public.handle_click(uuid,uuid,text)') is null then
    raise exception 'missing public.handle_click(uuid,uuid,text)';
  end if;

  if to_regprocedure('public.record_word_view(uuid,uuid,text)') is null then
    raise exception 'missing public.record_word_view(uuid,uuid,text)';
  end if;

  if to_regprocedure('public.ensure_user_dictionary(uuid,text,text)') is null then
    raise exception 'missing public.ensure_user_dictionary(uuid,text,text)';
  end if;

  if to_regprocedure('public.copy_entry_to_user_dictionary(uuid,uuid,uuid,jsonb)') is null then
    raise exception 'missing public.copy_entry_to_user_dictionary(uuid,uuid,uuid,jsonb)';
  end if;

  if to_regprocedure('public.create_user_dictionary_entry(uuid,uuid,jsonb)') is null then
    raise exception 'missing public.create_user_dictionary_entry(uuid,uuid,jsonb)';
  end if;

  if to_regprocedure('public.update_user_dictionary_entry(uuid,uuid,jsonb)') is null then
    raise exception 'missing public.update_user_dictionary_entry(uuid,uuid,jsonb)';
  end if;

  if to_regprocedure('public.delete_user_dictionary_entry(uuid,uuid)') is null then
    raise exception 'missing public.delete_user_dictionary_entry(uuid,uuid)';
  end if;

  if to_regprocedure('public.can_access_dictionary(uuid,uuid,text)') is null then
    raise exception 'missing public.can_access_dictionary(uuid,uuid,text)';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'word_entries'
      and column_name = 'meaning_id'
      and is_nullable = 'NO'
  ) then
    raise exception 'missing non-null public.word_entries.meaning_id';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'word_entries'
      and column_name = 'dictionary_id'
  ) then
    raise exception 'missing public.word_entries.dictionary_id';
  end if;

  if not exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and tablename = 'word_entries'
      and indexname = 'word_entries_dictionary_language_headword_meaning_idx'
  ) then
    raise exception 'missing dictionary-scoped word_entries uniqueness';
  end if;

  if exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and tablename = 'word_entries'
      and indexname = 'word_entries_language_headword_meaning_idx'
  ) then
    raise exception 'legacy global word_entries uniqueness still exists';
  end if;

  if not exists (
    select 1
    from public.dictionary_schemas
    where schema_key = 'nl-vandale-v1'
      and version = 1
  ) then
    raise exception 'missing seeded nl-vandale-v1 dictionary schema';
  end if;

  if not exists (
    select 1
    from public.dictionary_schemas
    where schema_key = 'user-entry-v1'
      and version = 1
      and json_schema ? 'anyOf'
  ) then
    raise exception 'missing seeded user-entry-v1 dictionary schema';
  end if;

  if not exists (
    select 1
    from public.dictionaries
    where language_code = 'nl'
      and slug = 'nl-vandale'
      and schema_key = 'nl-vandale-v1'
      and schema_version = 1
  ) then
    raise exception 'missing seeded nl-vandale dictionary';
  end if;

  if exists (
    select 1
    from public.word_entries
    where language_code = 'nl'
      and dictionary_id is null
  ) then
    raise exception 'Dutch word_entries without dictionary_id remain after backfill/import';
  end if;

  if exists (
    select 1
    from public.word_lists
    where language_code is not null
      and primary_language_code is null
  ) then
    raise exception 'word_lists.primary_language_code was not backfilled';
  end if;

  if exists (
    select 1
    from public.user_word_lists
    where language_code is not null
      and primary_language_code is null
  ) then
    raise exception 'user_word_lists.primary_language_code was not backfilled';
  end if;

  if exists (
    select 1
    from public.word_forms
    where dictionary_id is null
  ) then
    raise exception 'word_forms without dictionary_id remain after backfill/import';
  end if;
end $$;

select 'supabase_contracts' as check_name, 'ok' as value;
select 'dictionary_boundary' as check_name, 'ok' as value;

select 'rls_enabled_tables' as check_name, count(*)::text as value
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
  and c.relrowsecurity;

select 'public_policies' as check_name, count(*)::text as value
from pg_policies
where schemaname = 'public';

select 'languages' as check_name, count(*)::text as value from public.languages;
select 'dictionary_schemas' as check_name, count(*)::text as value from public.dictionary_schemas;
select 'dictionaries' as check_name, count(*)::text as value from public.dictionaries;
select 'word_entries' as check_name, count(*)::text as value from public.word_entries;
select 'word_entries_without_dictionary' as check_name, count(*)::text as value
from public.word_entries
where dictionary_id is null;
select 'word_lists' as check_name, count(*)::text as value from public.word_lists;
select 'word_forms' as check_name, count(*)::text as value from public.word_forms;
select 'word_forms_without_dictionary' as check_name, count(*)::text as value
from public.word_forms
where dictionary_id is null;
