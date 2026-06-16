\set ON_ERROR_STOP on

-- Live dictionary migration postflight.
-- Run after phase2 applies migration 052 through the latest migration.

\i db/scripts/local_supabase_probe.sql

do $$
declare
  v_problem text;
  v_volatility "char";
  v_update_position int;
begin
  with blocked(signature) as (
    values
      ('public.get_active_word_list(uuid)'::regprocedure),
      ('public.get_available_word_lists(uuid,text,text)'::regprocedure),
      ('public.update_active_word_list(uuid,uuid,text)'::regprocedure),
      ('public.get_available_learning_languages(uuid)'::regprocedure),
      ('public.get_available_dictionary_sources(uuid,text)'::regprocedure),
      ('public.get_active_training_scope(uuid,text)'::regprocedure),
      ('public.update_active_training_scope(uuid,text,uuid,text,text,text,text[],int)'::regprocedure),
      ('public.search_word_entries_gated(text,text,boolean,boolean,boolean,int,int,text,uuid[])'::regprocedure),
      ('public.assert_editable_user_dictionary(uuid,uuid)'::regprocedure),
      ('public.validate_user_entry_v1_payload(jsonb,text)'::regprocedure)
  )
  select string_agg(
    format('%s executable by %s', signature::text, acl.grantee::regrole),
    E'\n' order by signature::text, acl.grantee::regrole::text
  )
  into v_problem
  from blocked
  join pg_proc p on p.oid = blocked.signature
  cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
  where acl.privilege_type = 'EXECUTE'
    and (
      acl.grantee = 0
      or acl.grantee = 'anon'::regrole
      or (
        blocked.signature in (
          'public.assert_editable_user_dictionary(uuid,uuid)'::regprocedure,
          'public.validate_user_entry_v1_payload(jsonb,text)'::regprocedure
        )
        and acl.grantee = 'authenticated'::regrole
      )
    );

  if v_problem is not null then
    raise exception 'blocked RPC grants remain:%', E'\n' || v_problem;
  end if;

  select p.provolatile,
         position('UPDATE user_training_scopes' in pg_get_functiondef(p.oid))
  into v_volatility, v_update_position
  from pg_proc p
  where p.oid = 'public.get_active_training_scope(uuid,text)'::regprocedure;

  if v_volatility is distinct from 's' or v_update_position <> 0 then
    raise exception 'get_active_training_scope must be STABLE and read-only; volatility=%, update_position=%',
      v_volatility,
      v_update_position;
  end if;
end $$;

select 'live_dictionary_migration_postflight' as check_name, 'ok' as value;
