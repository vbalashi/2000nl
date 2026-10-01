\pset pager off
\pset format unaligned
\pset tuples_only on
\set ON_ERROR_STOP on
begin read only;
set local statement_timeout='8s';
set local lock_timeout='1s';
set local jit=off;
select set_config('lat.qa',(select id::text from auth.users where email=:'qa_email'),true) is not null;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('lat.qa'),'role','authenticated')::text,true) is not null;
explain (analyze,buffers,timing off,format json)
select public.get_training_session_plan(current_setting('lat.qa')::uuid,array['word-to-definition'],(select active_list_id from user_settings where user_id=current_setting('lat.qa')::uuid),(select coalesce(active_list_type,'curated') from user_settings where user_id=current_setting('lat.qa')::uuid),'both','{"timezone":"Europe/Amsterdam"}'::jsonb,'10',2);
rollback;
