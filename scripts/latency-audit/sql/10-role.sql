\pset pager off
\set ON_ERROR_STOP on
begin read only;
set local statement_timeout = '60s';
select set_config('lat.u', (select id::text from auth.users where email = :'qa_email'), true) is not null;
select p.proname, p.prosecdef security_definer, r.rolname owner, p.provolatile, p.proconfig
from pg_proc p join pg_roles r on r.oid = p.proowner join pg_namespace n on n.oid = p.pronamespace
where n.nspname in ('public','private') and p.proname in ('get_detailed_training_stats','get_detailed_training_stats_utc_legacy_v1','training_local_daily_stats_v1','read_platform_v2_training_group','get_next_training_session_card','perform_platform_v2_card_action_as_principal');
select set_config('request.jwt.claims', json_build_object('sub', current_setting('lat.u'), 'role', 'authenticated')::text, true) is not null;
select set_config('request.jwt.claim.sub', current_setting('lat.u'), true) is not null;
do $$
declare t0 timestamptz; v jsonb; u uuid := current_setting('lat.u')::uuid; r text := 'as postgres: ';
begin
  for i in 1..3 loop
    t0 := clock_timestamp(); v := public.get_detailed_training_stats(u, array['word-to-definition','definition-to-word'], null, 'curated');
    r := r || round((extract(epoch from clock_timestamp()-t0)*1000)::numeric) || ' ';
  end loop;
  raise notice '%', r;
end $$;
set local role authenticated;
do $$
declare t0 timestamptz; v jsonb; u uuid := current_setting('lat.u')::uuid; r text := 'as authenticated: ';
begin
  for i in 1..3 loop
    t0 := clock_timestamp(); v := public.get_detailed_training_stats(u, array['word-to-definition','definition-to-word'], null, 'curated');
    r := r || round((extract(epoch from clock_timestamp()-t0)*1000)::numeric) || ' ';
  end loop;
  raise notice '%', r;
end $$;
reset role;
commit;
