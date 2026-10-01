\pset pager off
begin read only;
select set_config('lat.u', (select id::text from auth.users where email = :'qa_email'), true) is not null;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('lat.u'), 'role', 'authenticated')::text, true) is not null;
explain (analyze, buffers, timing off, summary on, costs off)
  select private.get_detailed_training_stats_utc_legacy_v1(current_setting('lat.u')::uuid, array['word-to-definition','definition-to-word'], null, 'curated');
explain (analyze, buffers, timing off, summary on, costs off)
  select private.training_local_daily_stats_v1(current_setting('lat.u')::uuid, array['word-to-definition','definition-to-word'], null, 'curated', 'Europe/Amsterdam');
explain (analyze, buffers, timing off, summary on, costs off)
  select public.read_platform_v2_training_group(current_setting('lat.u')::uuid, (select entry_id from user_card_status where user_id = current_setting('lat.u')::uuid limit 1), 50);
explain (analyze, buffers, timing off, summary on, costs off)
  select public.get_training_session_plan(current_setting('lat.u')::uuid, array['word-to-definition','definition-to-word'], null, 'curated', 'both', '{"timezone":"Europe/Amsterdam"}'::jsonb, '10', 2);
select relname, pg_size_pretty(pg_relation_size(oid)) heap, pg_size_pretty(pg_total_relation_size(oid)) total, relpages from pg_class where relname in ('word_entries','word_list_items','user_card_status','user_review_log');
commit;
