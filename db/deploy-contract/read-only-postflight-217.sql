\i db/deploy-contract/read-only-postflight-216.sql
DO $probe$
BEGIN
 IF strpos(pg_get_indexdef('private.training_headword_exclusions_active_idx'::regclass),'entry_id')=0 THEN RAISE EXCEPTION 'invalid exact meaning exclusion index'; END IF;
 IF strpos(pg_get_functiondef('private.training_pair_excluded_v1(uuid,text,uuid,uuid,text,text)'::regprocedure),'entry_id=p_entry_id')=0 THEN RAISE EXCEPTION 'invalid exact meaning exclusion predicate'; END IF;
END;
$probe$;
