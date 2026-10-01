\pset pager off
\set ON_ERROR_STOP on
begin read only;
set local statement_timeout = '8s';
select set_config('lat.qa', (select id::text from auth.users where email = :'qa_email'), true) is not null;
do $$
declare
  u uuid; t0 timestamptz; v jsonb; who text; i int; a numeric[]; b numeric[]; c numeric[];
begin
  foreach who in array array['qa'] loop
    u := current_setting('lat.' || who)::uuid;
    perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', u::text, true);
    a := '{}'; b := '{}'; c := '{}';
    for i in 1..5 loop
      t0 := clock_timestamp();
      v := public.get_detailed_training_stats(u, array['word-to-definition'], null, 'curated');
      a := a || (extract(epoch from clock_timestamp() - t0) * 1000)::numeric;
      t0 := clock_timestamp();
      v := private.get_detailed_training_stats_utc_legacy_v1(u, array['word-to-definition'], null, 'curated');
      b := b || (extract(epoch from clock_timestamp() - t0) * 1000)::numeric;
      t0 := clock_timestamp();
      v := private.training_local_daily_stats_v1(u, array['word-to-definition'], null, 'curated', 'Europe/Amsterdam');
      c := c || (extract(epoch from clock_timestamp() - t0) * 1000)::numeric;
    end loop;
    raise notice '% stats total ms=% | legacy=% | local_daily=%', who, a, b, c;
  end loop;
end $$;
commit;
