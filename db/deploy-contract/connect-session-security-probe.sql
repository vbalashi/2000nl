DO $$
BEGIN
 IF to_regclass('private.api_session_boundary') IS NULL OR NOT EXISTS(SELECT 1 FROM private.api_session_boundary WHERE singleton) THEN
  RAISE EXCEPTION 'session_boundary_missing'; END IF;
 IF position('api_session_allowed_v1' IN pg_get_functiondef('public.admission_enforce()'::regprocedure))=0 THEN
  RAISE EXCEPTION 'session_pre_request_fence_missing'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_policy WHERE polrelid='realtime.messages'::regclass AND polname='api_session_fence' AND NOT polpermissive) THEN
  RAISE EXCEPTION 'session_realtime_fence_missing'; END IF;
 IF has_table_privilege('authenticated','public.connected_client_sessions','SELECT')
  OR has_table_privilege('anon','public.connected_client_sessions','SELECT')
  OR has_table_privilege('authenticated','private.api_session_boundary','UPDATE') THEN
  RAISE EXCEPTION 'connected_credential_boundary'; END IF;
 IF NOT has_function_privilege('authenticated','public.check_first_party_session_v1()','EXECUTE')
  OR has_function_privilege('anon','public.check_first_party_session_v1()','EXECUTE') THEN
  RAISE EXCEPTION 'first_party_session_rpc_boundary'; END IF;
 IF has_function_privilege('authenticated','public.check_admin_session_authority_v1(uuid,uuid)','EXECUTE')
  OR has_function_privilege('anon','public.check_admin_session_authority_v1(uuid,uuid)','EXECUTE')
  OR NOT has_function_privilege('service_role','public.check_admin_session_authority_v1(uuid,uuid)','EXECUTE') THEN
  RAISE EXCEPTION 'admin_session_rpc_boundary'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.connected_client_sessions'::regclass AND conname='connected_session_v2_complete') THEN
  RAISE EXCEPTION 'connected_session_v2_contract_missing'; END IF;
 IF EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relkind IN ('r','p') AND c.relrowsecurity
  AND (has_any_column_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE') OR has_table_privilege('authenticated',c.oid,'DELETE'))
  AND NOT EXISTS(SELECT 1 FROM pg_policy p WHERE p.polrelid=c.oid AND p.polname='api_session_fence' AND NOT p.polpermissive)) THEN
  RAISE EXCEPTION 'session_table_fence_missing'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.connect_authorization_codes'::regclass AND tgname='connect_code_grant' AND tgenabled='O')
  OR NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.connected_client_sessions'::regclass AND tgname='connected_session_v2_guard' AND tgenabled='O') THEN
  RAISE EXCEPTION 'connect_grant_lifetime_guard_missing'; END IF;
 IF position('authority_revision=NEW.grant_revision' IN pg_get_functiondef('private.bind_connect_code_grant_v2()'::regprocedure))=0
  OR position('INTO NEW.grant_revision' IN pg_get_functiondef('private.bind_connect_code_grant_v2()'::regprocedure))>0 THEN
  RAISE EXCEPTION 'connect_code_consent_revision_guard_missing'; END IF;
END $$;
