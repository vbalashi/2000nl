\i db/deploy-contract/read-only-postflight-218.sql
DO $probe$
BEGIN
 IF strpos(pg_get_functiondef('private.perform_platform_v2_card_action_without_verifiable_receipt(uuid,text,uuid,text,text,uuid,text,text,uuid,jsonb,text,text)'::regprocedure),'shared-meaning-known:')=0 THEN RAISE EXCEPTION 'missing meaning mutation serialization'; END IF;
END;
$probe$;
