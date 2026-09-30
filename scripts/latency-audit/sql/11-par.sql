\pset pager off
\pset tuples_only on
begin read only;
select set_config('lat.u', (select id::text from auth.users where email = :'qa_email'), true) is not null;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('lat.u'), 'role', 'authenticated')::text, true) is not null;
do $$
declare t0 timestamptz; v jsonb; u uuid := current_setting('lat.u')::uuid; r text := '';
begin
  for i in 1..4 loop
    t0 := clock_timestamp(); v := public.get_detailed_training_stats(u, array['word-to-definition','definition-to-word'], null, 'curated');
    r := r || round((extract(epoch from clock_timestamp()-t0)*1000)::numeric) || ' ';
  end loop;
  raise notice 'stats: %', r;
end $$;
commit;
