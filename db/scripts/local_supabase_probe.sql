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

  if to_regprocedure('public.get_next_card(uuid,text[],uuid[],uuid,text,text,text,text[])') is null then
    raise exception 'missing public.get_next_card(uuid,text[],uuid[],uuid,text,text,text,text[])';
  end if;

  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'get_next_word'
  ) then
    raise exception 'legacy public.get_next_word overloads still exist';
  end if;

  if to_regprocedure('public.handle_card_review(uuid,uuid,text,text,uuid)') is null then
    raise exception 'missing public.handle_card_review(uuid,uuid,text,text,uuid)';
  end if;

  if pg_get_function_arguments(to_regprocedure('public.handle_card_review(uuid,uuid,text,text,uuid)')) not like '%p_entry_id uuid%' then
    raise exception 'public.handle_card_review must use p_entry_id';
  end if;

  if pg_get_function_arguments(to_regprocedure('public.handle_card_review(uuid,uuid,text,text,uuid)')) not like '%p_card_type_id text%' then
    raise exception 'public.handle_card_review must use p_card_type_id';
  end if;

  if to_regprocedure('public.handle_review(uuid,uuid,text,text,uuid)') is not null then
    raise exception 'legacy public.handle_review(uuid,uuid,text,text,uuid) still exists';
  end if;

  if to_regprocedure('public.handle_click(uuid,uuid,text)') is not null then
    raise exception 'legacy public.handle_click(uuid,uuid,text) still exists';
  end if;

  if to_regprocedure('public.record_card_view(uuid,uuid,text)') is null then
    raise exception 'missing public.record_card_view(uuid,uuid,text)';
  end if;

  if pg_get_function_arguments(to_regprocedure('public.record_card_view(uuid,uuid,text)')) not like '%p_entry_id uuid%' then
    raise exception 'public.record_card_view must use p_entry_id';
  end if;

  if pg_get_function_arguments(to_regprocedure('public.record_card_view(uuid,uuid,text)')) not like '%p_card_type_id text%' then
    raise exception 'public.record_card_view must use p_card_type_id';
  end if;

  if to_regprocedure('public.record_word_view(uuid,uuid,text)') is not null then
    raise exception 'legacy public.record_word_view(uuid,uuid,text) still exists';
  end if;

  if to_regprocedure('public.start_learning_entry_card(uuid,uuid,text)') is null then
    raise exception 'missing public.start_learning_entry_card(uuid,uuid,text)';
  end if;

  if pg_get_function_arguments(to_regprocedure('public.start_learning_entry_card(uuid,uuid,text)')) not like '%p_entry_id uuid%' then
    raise exception 'public.start_learning_entry_card must use p_entry_id';
  end if;

  if pg_get_function_arguments(to_regprocedure('public.start_learning_entry_card(uuid,uuid,text)')) not like '%p_card_type_id text%' then
    raise exception 'public.start_learning_entry_card must use p_card_type_id';
  end if;

  if to_regprocedure('public.start_learning_card(uuid,uuid,text)') is not null then
    raise exception 'legacy public.start_learning_card(uuid,uuid,text) still exists';
  end if;

  if to_regprocedure('public.ensure_user_dictionary(uuid,text,text)') is null then
    raise exception 'missing public.ensure_user_dictionary(uuid,text,text)';
  end if;

  if to_regprocedure('public.copy_entry_to_user_dictionary(uuid,uuid,uuid,jsonb)') is null then
    raise exception 'missing public.copy_entry_to_user_dictionary(uuid,uuid,uuid,jsonb)';
  end if;

  if pg_get_function_arguments(to_regprocedure('public.copy_entry_to_user_dictionary(uuid,uuid,uuid,jsonb)')) not like '%p_source_entry_id uuid%' then
    raise exception 'public.copy_entry_to_user_dictionary must use p_source_entry_id';
  end if;

  if to_regprocedure('public.create_user_dictionary_entry(uuid,uuid,jsonb)') is null then
    raise exception 'missing public.create_user_dictionary_entry(uuid,uuid,jsonb)';
  end if;

  if to_regprocedure('public.update_user_dictionary_entry(uuid,uuid,jsonb)') is null then
    raise exception 'missing public.update_user_dictionary_entry(uuid,uuid,jsonb)';
  end if;

  if pg_get_function_arguments(to_regprocedure('public.update_user_dictionary_entry(uuid,uuid,jsonb)')) not like '%p_entry_id uuid%' then
    raise exception 'public.update_user_dictionary_entry must use p_entry_id';
  end if;

  if to_regprocedure('public.delete_user_dictionary_entry(uuid,uuid)') is null then
    raise exception 'missing public.delete_user_dictionary_entry(uuid,uuid)';
  end if;

  if pg_get_function_arguments(to_regprocedure('public.delete_user_dictionary_entry(uuid,uuid)')) not like '%p_entry_id uuid%' then
    raise exception 'public.delete_user_dictionary_entry must use p_entry_id';
  end if;

  if to_regprocedure('public.fetch_dictionary_entry_by_id_gated(uuid)') is null then
    raise exception 'missing public.fetch_dictionary_entry_by_id_gated(uuid)';
  end if;

  if pg_get_function_arguments(to_regprocedure('public.fetch_dictionary_entry_by_id_gated(uuid)')) not like '%p_entry_id uuid%' then
    raise exception 'public.fetch_dictionary_entry_by_id_gated must use p_entry_id';
  end if;

  if to_regprocedure('public.add_entry_to_user_list(uuid,uuid,uuid)') is null then
    raise exception 'missing public.add_entry_to_user_list(uuid,uuid,uuid)';
  end if;

  if pg_get_function_arguments(to_regprocedure('public.add_entry_to_user_list(uuid,uuid,uuid)')) not like '%p_entry_id uuid%' then
    raise exception 'public.add_entry_to_user_list must use p_entry_id';
  end if;

  if to_regprocedure('public.remove_entries_from_user_list(uuid,uuid,uuid[])') is null then
    raise exception 'missing public.remove_entries_from_user_list(uuid,uuid,uuid[])';
  end if;

  if pg_get_function_arguments(to_regprocedure('public.remove_entries_from_user_list(uuid,uuid,uuid[])')) not like '%p_entry_ids uuid[]%' then
    raise exception 'public.remove_entries_from_user_list must use p_entry_ids';
  end if;

  if to_regprocedure('public.get_user_list_membership(uuid,uuid,uuid[])') is null then
    raise exception 'missing public.get_user_list_membership(uuid,uuid,uuid[])';
  end if;

  if pg_get_function_arguments(to_regprocedure('public.get_user_list_membership(uuid,uuid,uuid[])')) not like '%p_entry_ids uuid[]%' then
    raise exception 'public.get_user_list_membership must use p_entry_ids';
  end if;

  if to_regprocedure('public.get_user_list_memberships_for_entries(uuid,uuid[])') is null then
    raise exception 'missing public.get_user_list_memberships_for_entries(uuid,uuid[])';
  end if;

  if pg_get_function_arguments(to_regprocedure('public.get_user_list_memberships_for_entries(uuid,uuid[])')) not like '%p_entry_ids uuid[]%' then
    raise exception 'public.get_user_list_memberships_for_entries must use p_entry_ids';
  end if;

  if to_regprocedure('public.can_access_dictionary(uuid,uuid,text)') is null then
    raise exception 'missing public.can_access_dictionary(uuid,uuid,text)';
  end if;

  if to_regprocedure('private.resolve_dictionary_lookup_candidates_v1(uuid,text,text,uuid[],boolean,integer)') is null then
    raise exception 'missing private.resolve_dictionary_lookup_candidates_v1(uuid,text,text,uuid[],boolean,integer)';
  end if;

  if to_regprocedure('public.lookup_dictionary_entries_v3(text,text,uuid[],integer)') is null then
    raise exception 'missing public.lookup_dictionary_entries_v3(text,text,uuid[],integer)';
  end if;

  if to_regprocedure('public.lookup_public_catalog_entries_v1(text,text,integer)') is null then
    raise exception 'missing public.lookup_public_catalog_entries_v1(text,text,integer)';
  end if;

  if to_regprocedure('public.start_dictionary_search_backfill(integer,integer)') is null then
    raise exception 'missing public.start_dictionary_search_backfill(integer,integer)';
  end if;

  if to_regprocedure('public.run_dictionary_search_backfill_batch(uuid)') is null then
    raise exception 'missing public.run_dictionary_search_backfill_batch(uuid)';
  end if;

  if to_regprocedure('public.get_dictionary_search_backfill_status(uuid)') is null then
    raise exception 'missing public.get_dictionary_search_backfill_status(uuid)';
  end if;

  if to_regprocedure('public.search_dictionary_groups_v1(text,text,uuid[],text,integer,text)') is null then
    raise exception 'missing public.search_dictionary_groups_v1(text,text,uuid[],text,integer,text)';
  end if;

  if to_regprocedure('public.search_public_dictionary_groups_v1(text,text,text,integer,text)') is null then
    raise exception 'missing public.search_public_dictionary_groups_v1(text,text,text,integer,text)';
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

  if not exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and tablename = 'word_entries'
      and indexname = 'word_entries_language_lower_headword_idx'
  ) then
    raise exception 'missing lower-headword dictionary search index';
  end if;

  if not exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and tablename = 'word_forms'
      and indexname = 'word_forms_language_lower_form_dictionary_idx'
  ) then
    raise exception 'missing lower-form dictionary search index';
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
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'dictionary_search_fields'
      and column_name = 'field_kind'
  ) then
    raise exception 'missing public.dictionary_search_fields.field_kind';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'dictionary_search_fields'
      and column_name = 'meaning_ordinal'
  ) then
    raise exception 'missing public.dictionary_search_fields.meaning_ordinal';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'dictionary_search_fields'
      and column_name = 'item_ordinal'
  ) then
    raise exception 'missing public.dictionary_search_fields.item_ordinal';
  end if;

  if not exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'dictionary_search_backfill_runs'
  ) then
    raise exception 'missing public.dictionary_search_backfill_runs';
  end if;

  if not exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and tablename = 'dictionary_search_fields'
      and indexname = 'dictionary_search_fields_entry_source_path_v2_idx'
      and indexdef like '%UNIQUE%'
      and indexdef like '%entry_id, source_path%'
      and indexdef like '%extraction_version >= 2%'
  ) then
    raise exception 'missing stable v2 dictionary_search_fields identity index';
  end if;

  if not exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and tablename = 'dictionary_search_documents'
      and indexname = 'dictionary_search_documents_browse_idx'
  ) then
    raise exception 'missing dictionary_search_documents browse index';
  end if;

  if not exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and tablename = 'dictionary_search_fields'
      and indexname = 'dictionary_search_fields_examples_tsv_v2_idx'
      and indexdef like '%field_group = ANY%'
  ) then
    raise exception 'missing dictionary_search_fields examples partial tsv index';
  end if;

  if not exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and tablename = 'dictionary_search_fields'
      and indexname = 'dictionary_search_fields_definitions_tsv_v2_idx'
      and indexdef like '%field_group = ANY%'
  ) then
    raise exception 'missing dictionary_search_fields definitions partial tsv index';
  end if;

  if has_table_privilege('anon', 'public.dictionary_search_fields', 'select')
     or has_table_privilege('authenticated', 'public.dictionary_search_fields', 'select')
     or has_table_privilege('anon', 'public.dictionary_search_documents', 'select')
     or has_table_privilege('authenticated', 'public.dictionary_search_documents', 'select') then
    raise exception 'dictionary search index tables are directly readable by client roles';
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

do $$
declare
  v_problem text;
begin
  select pg_catalog.string_agg(
    p.oid::regprocedure::text,
    E'\n' order by p.oid::regprocedure::text
  )
  into v_problem
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.prosecdef
    and not exists (
      select 1
      from unnest(coalesce(p.proconfig, array[]::text[])) as c(config)
      where c.config like 'search_path=%'
    );

  if v_problem is not null then
    raise exception 'SECURITY DEFINER functions without fixed search_path:%', E'\n' || v_problem;
  end if;

  with sensitive_functions(signature) as (
    values
      ('public.get_next_card(uuid,text[],uuid[],uuid,text,text,text,text[])'::regprocedure),
      ('public.handle_card_review(uuid,uuid,text,text,uuid)'::regprocedure),
      ('public.record_card_view(uuid,uuid,text)'::regprocedure),
      ('public.start_learning_entry_card(uuid,uuid,text)'::regprocedure),
      ('public.get_user_card_state(uuid,uuid,text)'::regprocedure),
      ('public.get_user_card_states_for_entries(uuid,uuid[],text[])'::regprocedure),
      ('public.get_recent_training_history(uuid,timestamp with time zone,integer)'::regprocedure),
      ('public.get_learning_preferences(uuid)'::regprocedure),
      ('public.update_learning_preferences(uuid,text[],text,text,integer,text)'::regprocedure),
      ('public.get_active_word_list(uuid)'::regprocedure),
      ('public.update_active_word_list(uuid,uuid,text)'::regprocedure),
      ('public.get_training_stats(uuid,text[],uuid,text)'::regprocedure),
      ('public.get_training_stats(uuid,text,uuid,text)'::regprocedure),
      ('public.get_detailed_training_stats(uuid,text[],uuid,text)'::regprocedure),
      ('public.get_scenario_word_stats(uuid,uuid,text)'::regprocedure),
      ('public.get_scenario_stats(uuid,text,uuid,text)'::regprocedure),
      ('public.create_user_word_list(uuid,text,text,text,text,text,text,text[])'::regprocedure),
      ('public.update_user_word_list(uuid,uuid,text,text,text,text,text,text,text[],boolean)'::regprocedure),
      ('public.delete_user_word_list(uuid,uuid)'::regprocedure),
      ('public.add_entry_to_user_list(uuid,uuid,uuid)'::regprocedure),
      ('public.remove_entries_from_user_list(uuid,uuid,uuid[])'::regprocedure),
      ('public.get_user_list_membership(uuid,uuid,uuid[])'::regprocedure),
      ('public.get_user_list_memberships_for_entries(uuid,uuid[])'::regprocedure),
      ('public.copy_entry_to_user_dictionary(uuid,uuid,uuid,jsonb)'::regprocedure),
      ('public.create_user_dictionary_entry(uuid,uuid,jsonb)'::regprocedure),
      ('public.update_user_dictionary_entry(uuid,uuid,jsonb)'::regprocedure),
      ('public.delete_user_dictionary_entry(uuid,uuid)'::regprocedure),
      ('public.fetch_dictionary_entry_by_id_gated(uuid)'::regprocedure),
      ('public.ensure_user_dictionary(uuid,text,text)'::regprocedure),
      ('public.get_available_learning_languages(uuid)'::regprocedure),
      ('public.get_available_dictionary_sources(uuid,text)'::regprocedure),
      ('public.get_active_training_scope(uuid,text)'::regprocedure),
      ('public.update_active_training_scope(uuid,text,uuid,text,text,text,text[],int)'::regprocedure),
      ('public.get_available_word_lists(uuid,text,text)'::regprocedure),
      ('public.search_word_entries_gated(text,text,boolean,boolean,boolean,int,int,text,uuid[])'::regprocedure),
      ('public.lookup_dictionary_entries_v3(text,text,uuid[],integer)'::regprocedure),
      ('public.lookup_public_catalog_entries_v1(text,text,integer)'::regprocedure),
      ('public.start_dictionary_search_backfill(integer,integer)'::regprocedure),
      ('public.run_dictionary_search_backfill_batch(uuid)'::regprocedure),
      ('public.get_dictionary_search_backfill_status(uuid)'::regprocedure),
      ('private.encode_dictionary_search_cursor_v1(jsonb)'::regprocedure),
      ('private.decode_dictionary_search_cursor_v1(text)'::regprocedure),
      ('private.search_dictionary_group_v1(uuid,boolean,text,text,uuid[],text,integer,text)'::regprocedure),
      ('public.search_dictionary_groups_v1(text,text,uuid[],text,integer,text)'::regprocedure),
      ('public.search_public_dictionary_groups_v1(text,text,text,integer,text)'::regprocedure),
      ('public.get_card_user_state(uuid,uuid,text)'::regprocedure),
      ('public.get_user_tier(uuid)'::regprocedure),
      ('public.get_word_list_summary(uuid,uuid,text)'::regprocedure)
  )
  select pg_catalog.string_agg(signature::text, E'\n' order by signature::text)
  into v_problem
  from sensitive_functions sf
  join pg_proc p on p.oid = sf.signature
  where exists (
    select 1
    from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) as acl
    where acl.privilege_type = 'EXECUTE'
      and (
        acl.grantee = 0
        or acl.grantee = 'anon'::regrole
      )
  );

  if v_problem is not null then
    raise exception 'sensitive RPCs still executable by PUBLIC/anon:%', E'\n' || v_problem;
  end if;

  with internal_helpers(signature) as (
    values
      ('public.assert_editable_user_dictionary(uuid,uuid)'::regprocedure),
      ('public.validate_user_entry_v1_payload(jsonb,text)'::regprocedure),
      ('private.resolve_dictionary_lookup_candidates_v1(uuid,text,text,uuid[],boolean,integer)'::regprocedure)
  )
  select pg_catalog.string_agg(signature::text, E'\n' order by signature::text)
  into v_problem
  from internal_helpers ih
  join pg_proc p on p.oid = ih.signature
  where exists (
    select 1
    from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) as acl
    where acl.privilege_type = 'EXECUTE'
      and (
        acl.grantee = 0
        or acl.grantee = 'anon'::regrole
        or acl.grantee = 'authenticated'::regrole
      )
  );

  if v_problem is not null then
    raise exception 'internal helper RPCs still directly executable:%', E'\n' || v_problem;
  end if;

  with active_public_functions as (
    select p.oid as function_oid, pg_get_functiondef(p.oid) as definition
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind = 'f'
  )
  select pg_catalog.string_agg(
    function_oid::regprocedure::text,
    E'\n' order by function_oid::regprocedure::text
  )
  into v_problem
  from active_public_functions
  where definition like '%p_user_id != (select auth.uid())%'
     or definition like '%p_user_id IS NULL OR p_user_id != (select auth.uid())%'
     or definition like '%p_user_id != auth.uid()%'
     or definition like '%p_user_id IS NULL OR p_user_id != auth.uid()%';

  if v_problem is not null then
    raise exception 'null-unsafe p_user_id/auth.uid() guard remains in active RPCs:%', E'\n' || v_problem;
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
