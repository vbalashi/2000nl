\pset pager off
\pset format unaligned
\pset tuples_only on
select pg_get_functiondef('private.training_scheduler_candidates_v2(uuid,text[],uuid,text,text,text,uuid[],text[],jsonb,boolean,boolean)'::regprocedure);
