\pset pager off
\pset format unaligned
\pset tuples_only on
\set ON_ERROR_STOP on
begin read only;
set local statement_timeout='8s';
set local lock_timeout='1s';
select set_config('lat.qa',(select id::text from auth.users where email=:'qa_email'),true) is not null;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('lat.qa'),'role','authenticated')::text,true) is not null;
show jit;show work_mem;show plan_cache_mode;
explain (analyze,buffers,timing off,format json) select count(*) from private.training_scheduler_candidates_v2(current_setting('lat.qa')::uuid,array['word-to-definition'],(select active_list_id from user_settings where user_id=current_setting('lat.qa')::uuid),(select coalesce(active_list_type,'curated') from user_settings where user_id=current_setting('lat.qa')::uuid),'both','auto',array[]::uuid[],array[]::text[],'{"timezone":"Europe/Amsterdam"}'::jsonb,false,false);
set local plan_cache_mode=force_custom_plan;
explain (analyze,buffers,timing off,format json) select count(*) from private.training_scheduler_candidates_v2(current_setting('lat.qa')::uuid,array['word-to-definition'],(select active_list_id from user_settings where user_id=current_setting('lat.qa')::uuid),(select coalesce(active_list_type,'curated') from user_settings where user_id=current_setting('lat.qa')::uuid),'both','auto',array[]::uuid[],array[]::text[],'{"timezone":"Europe/Amsterdam"}'::jsonb,false,false);
set local plan_cache_mode=auto;
explain (analyze,buffers,timing off,format json) select count(*) from private.training_scheduler_candidates_v2(current_setting('lat.qa')::uuid,array['word-to-definition'],(select active_list_id from user_settings where user_id=current_setting('lat.qa')::uuid),(select coalesce(active_list_type,'curated') from user_settings where user_id=current_setting('lat.qa')::uuid),'both','auto',array[]::uuid[],array[]::text[],'{"timezone":"Europe/Amsterdam"}'::jsonb,false,false);
set local jit=off;
explain (analyze,buffers,timing off,format json) select count(*) from private.training_scheduler_candidates_v2(current_setting('lat.qa')::uuid,array['word-to-definition'],(select active_list_id from user_settings where user_id=current_setting('lat.qa')::uuid),(select coalesce(active_list_type,'curated') from user_settings where user_id=current_setting('lat.qa')::uuid),'both','auto',array[]::uuid[],array[]::text[],'{"timezone":"Europe/Amsterdam"}'::jsonb,false,false);
rollback;
