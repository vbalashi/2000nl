\pset pager off
\set ON_ERROR_STOP on
begin read only;
set local statement_timeout = '120s';
select set_config('lat.qa', (select id::text from auth.users where email = :'qa_email'), true);
select set_config('lat.heavy', (select user_id::text from user_review_log group by user_id order by count(*) desc limit 1), true);
select set_config('request.jwt.claims', json_build_object('role','service_role')::text, true);
select set_config('request.jwt.claim.role', 'service_role', true);
do $$
declare
  u uuid; e uuid; t0 timestamptz; d numeric; arr numeric[]; arr_base numeric[]; arr_id numeric[]; v jsonb; n int := 0; who text;
begin
  foreach who in array array['qa','heavy'] loop
    u := current_setting('lat.' || who)::uuid;
    arr := '{}'; arr_base := '{}'; arr_id := '{}';
    for e in select entry_id from user_card_status where user_id = u order by random() limit 25 loop
      t0 := clock_timestamp();
      v := public.read_platform_v2_training_group(u, e, 50);
      arr := arr || extract(epoch from clock_timestamp() - t0)::numeric * 1000;
      t0 := clock_timestamp();
      v := private.read_platform_v2_training_group_base_v1(u, e, 50);
      arr_base := arr_base || extract(epoch from clock_timestamp() - t0)::numeric * 1000;
      t0 := clock_timestamp();
      v := private.attach_platform_v2_presentation_identity_v1(v, u, false);
      arr_id := arr_id || extract(epoch from clock_timestamp() - t0)::numeric * 1000;
    end loop;
    raise notice '% read_platform_v2_training_group n=% p50=% p95=% max=% | base p50=% p95=% | identity p50=% p95=%', who, cardinality(arr),
      (select round(percentile_cont(0.5) within group (order by x)::numeric,1) from unnest(arr) x),
      (select round(percentile_cont(0.95) within group (order by x)::numeric,1) from unnest(arr) x),
      (select round(max(x),1) from unnest(arr) x),
      (select round(percentile_cont(0.5) within group (order by x)::numeric,1) from unnest(arr_base) x),
      (select round(percentile_cont(0.95) within group (order by x)::numeric,1) from unnest(arr_base) x),
      (select round(percentile_cont(0.5) within group (order by x)::numeric,1) from unnest(arr_id) x),
      (select round(percentile_cont(0.95) within group (order by x)::numeric,1) from unnest(arr_id) x);
  end loop;
end $$;
commit;
