\pset pager off
\pset tuples_only on
select 'pid=' || pg_backend_pid() || ' age_s=' || round(extract(epoch from now() - backend_start)::numeric,2) from pg_stat_activity where pid = pg_backend_pid();
begin read only;
select set_config('lat.u', (select id::text from auth.users where email = :'qa_email'), true) is not null;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('lat.u'), 'role', 'authenticated')::text, true) is not null;
do $$
declare t0 timestamptz; v jsonb; u uuid := current_setting('lat.u')::uuid; e uuid; r text := '';
begin
  select entry_id into e from user_card_status where user_id = u limit 1;
  t0 := clock_timestamp(); v := public.read_platform_v2_training_group(u, e, 50);
  r := r || 'group1=' || round((extract(epoch from clock_timestamp()-t0)*1000)::numeric) || ' ';
  t0 := clock_timestamp(); v := public.read_platform_v2_training_group(u, e, 50);
  r := r || 'group2=' || round((extract(epoch from clock_timestamp()-t0)*1000)::numeric) || ' ';
  t0 := clock_timestamp(); v := public.get_detailed_training_stats(u, array['word-to-definition','definition-to-word'], null, 'curated');
  r := r || 'stats1=' || round((extract(epoch from clock_timestamp()-t0)*1000)::numeric) || ' ';
  t0 := clock_timestamp(); v := public.get_detailed_training_stats(u, array['word-to-definition','definition-to-word'], null, 'curated');
  r := r || 'stats2=' || round((extract(epoch from clock_timestamp()-t0)*1000)::numeric) || ' ';
  raise notice '%', r;
end $$;
commit;
select pg_terminate_backend(pg_backend_pid());
