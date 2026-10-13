\i db/deploy-contract/read-only-postflight-224.sql
DO $hide_retired$
DECLARE f pg_proc;
BEGIN
 SELECT * INTO STRICT f FROM pg_proc
 WHERE oid='public.handle_card_review(uuid,uuid,text,text,uuid)'::regprocedure;
 IF position('legacy_hide_disabled' IN f.prosrc)=0
 OR position('legacy_hide_disabled' IN f.prosrc)>position('IF p_turn_id IS NOT NULL THEN' IN f.prosrc)
 OR f.prosrc ~ 'SET hidden = true'
 OR NOT f.prosecdef
 OR NOT COALESCE('search_path=public, pg_temp'=ANY(f.proconfig),false)
 OR has_function_privilege('anon',f.oid,'EXECUTE')
 OR NOT has_function_privilege('authenticated',f.oid,'EXECUTE')
 OR EXISTS(SELECT 1 FROM aclexplode(COALESCE(f.proacl,acldefault('f',f.proowner))) WHERE grantee=0 AND privilege_type='EXECUTE')
 OR position('require_training_pair_available_v1' IN f.prosrc)=0
 OR position('private.training_reference_now_v1()' IN f.prosrc)=0
 OR NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.user_card_status'::regclass AND tgname='reject_known_card_scheduler_mutation' AND tgenabled='O')
 OR position('IF p_result = ''freeze'' THEN' IN f.prosrc)=0
 THEN RAISE EXCEPTION 'legacy hide retirement contract mismatch'; END IF;
END $hide_retired$;
