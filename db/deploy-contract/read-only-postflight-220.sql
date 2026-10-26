\i db/deploy-contract/read-only-postflight-219.sql
DO $probe$
BEGIN
 IF strpos(pg_get_functiondef('public.get_meanings_learning_progress_v1(uuid[])'::regprocedure),'1250')=0
 OR strpos(pg_get_functiondef('public.get_meanings_learning_progress_v1(uuid[])'::regprocedure),'states AS MATERIALIZED')=0
 THEN RAISE EXCEPTION 'invalid bounded set-based meaning progress'; END IF;
 IF strpos(pg_get_functiondef('public.get_meaning_learning_progress_v1(uuid)'::regprocedure),'get_meanings_learning_progress_v1')=0
 THEN RAISE EXCEPTION 'single meaning must share the batch projection'; END IF;
END;
$probe$;
