\pset pager off
\set ON_ERROR_STOP on
begin read only;
set local statement_timeout = '120s';
select set_config('lat.qa', (select id::text from auth.users where email = :'qa_email'), true) is not null;
select set_config('lat.heavy', (select user_id::text from user_review_log group by user_id order by count(*) desc limit 1), true) is not null;
do $$
declare
  u uuid; t0 timestamptz; v jsonb; who text; i int; a numeric[]; b numeric[]; c numeric[]; lid uuid; lt text;
begin
  foreach who in array array['qa','heavy'] loop
    u := current_setting('lat.' || who)::uuid;
    perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', u::text, true);
    select active_list_id, active_list_type into lid, lt from user_settings where user_id = u;
    a := '{}'; b := '{}'; c := '{}';
    for i in 1..3 loop
      t0 := clock_timestamp();
      v := public.get_training_session_plan(u, array['word-to-definition','definition-to-word'], lid, coalesce(lt,'curated'), 'both', '{"timezone":"Europe/Amsterdam"}'::jsonb, '10', 2);
      a := a || round((extract(epoch from clock_timestamp() - t0) * 1000)::numeric);
      t0 := clock_timestamp();
      v := public.get_training_session_plan(u, array['word-to-definition','definition-to-word'], lid, coalesce(lt,'curated'), 'both', '{"timezone":"Europe/Amsterdam"}'::jsonb, 'all-due-today', 2);
      b := b || round((extract(epoch from clock_timestamp() - t0) * 1000)::numeric);
      t0 := clock_timestamp();
      perform count(*) from public.get_next_training_session_card(u, (select session_id from training_active_runs where user_id = u limit 1), array[]::text[]);
      c := c || round((extract(epoch from clock_timestamp() - t0) * 1000)::numeric);
    end loop;
    raise notice '% list=% plan(10)=% plan(all-due)=% next_session_card=%', who, lt, a, b, c;
  end loop;
end $$;
commit;
