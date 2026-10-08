\i db/deploy-contract/read-only-postflight-214.sql
DO $probe$
BEGIN
 IF strpos(pg_get_functiondef('public.start_learning_entry_card(uuid,uuid,text)'::regprocedure),'known.cleared_at IS NULL')=0
 OR strpos(pg_get_functiondef('public.start_learning_entry_card(uuid,uuid,text)'::regprocedure),'private.training_reference_now_v1()')=0 THEN RAISE EXCEPTION 'invalid Known-safe enrollment'; END IF;
END;
$probe$;
