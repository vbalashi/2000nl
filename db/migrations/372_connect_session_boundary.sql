BEGIN;
-- Fresh-install boundary. Retained installations need a separately reviewed
-- coordinated auth cutover: see docs/connect-session-security.md.
CREATE TABLE private.api_session_boundary (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
 sessions_not_before timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE private.api_session_boundary ENABLE ROW LEVEL SECURITY;
INSERT INTO private.api_session_boundary(singleton) VALUES(true);
REVOKE ALL ON private.api_session_boundary FROM PUBLIC,anon,authenticated,service_role;

ALTER TABLE public.connected_client_grants ADD COLUMN authority_revision uuid NOT NULL DEFAULT gen_random_uuid();
CREATE FUNCTION private.advance_connected_grant_authority_v2() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF NEW.scopes IS DISTINCT FROM OLD.scopes OR NEW.revoked_at IS DISTINCT FROM OLD.revoked_at THEN
  NEW.authority_revision:=gen_random_uuid();
 ELSE NEW.authority_revision:=OLD.authority_revision; END IF;
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.advance_connected_grant_authority_v2() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER connected_grant_authority BEFORE UPDATE ON public.connected_client_grants
 FOR EACH ROW EXECUTE FUNCTION private.advance_connected_grant_authority_v2();

-- Codes retain the grant lifetime that produced consent; NULL legacy codes fail closed.
ALTER TABLE public.connect_authorization_codes ADD COLUMN grant_revision uuid;
CREATE FUNCTION private.bind_connect_code_grant_v2() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 SELECT authority_revision INTO NEW.grant_revision FROM public.connected_client_grants
 WHERE client_id=NEW.client_id AND user_id=NEW.user_id AND revoked_at IS NULL
 AND NEW.scopes <@ scopes FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'invalid_connected_grant' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.bind_connect_code_grant_v2() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER connect_code_grant BEFORE INSERT ON public.connect_authorization_codes
 FOR EACH ROW EXECUTE FUNCTION private.bind_connect_code_grant_v2();

ALTER TABLE public.connected_client_sessions
 ADD COLUMN grant_revision uuid,
 ADD COLUMN refresh_token_family_hashes text[] NOT NULL DEFAULT ARRAY[]::text[],
 ADD COLUMN credential_version integer NOT NULL DEFAULT 1 CHECK(credential_version IN (1,2)),
 ADD COLUMN auth_session_id uuid REFERENCES auth.sessions(id) ON DELETE CASCADE,
 ADD COLUMN provider_session_ciphertext text,
 ADD COLUMN backend_proof_hash text,
 ADD COLUMN refresh_token_expires_at timestamptz,
 ADD CONSTRAINT connected_session_v2_complete CHECK(credential_version<>2 OR (
  auth_session_id IS NOT NULL AND grant_revision IS NOT NULL AND provider_session_ciphertext IS NOT NULL
  AND cardinality(refresh_token_family_hashes) BETWEEN 1 AND 4096
  AND backend_proof_hash ~ '^[0-9a-f]{64}$' AND refresh_token_expires_at IS NOT NULL
  AND access_token_expires_at IS NOT NULL));
CREATE INDEX connected_session_refresh_family ON public.connected_client_sessions USING gin(refresh_token_family_hashes);
CREATE UNIQUE INDEX connected_session_auth_identity ON public.connected_client_sessions(auth_session_id) WHERE auth_session_id IS NOT NULL;
-- Existing table is service-only. No additional role receives credential access.
REVOKE ALL ON public.connected_client_sessions FROM PUBLIC,anon,authenticated;

CREATE FUNCTION private.request_auth_session_id_v1() RETURNS uuid
LANGUAGE plpgsql STABLE SET search_path=pg_catalog AS $$
DECLARE value text;
BEGIN
 value:=coalesce(nullif(current_setting('request.jwt.claim.session_id',true),''),
  nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'session_id');
 IF value IS NULL OR value !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN RETURN NULL; END IF;
 RETURN value::uuid;
END;
$$;
REVOKE ALL ON FUNCTION private.request_auth_session_id_v1() FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION private.api_session_allowed_v1(p_first_party_only boolean DEFAULT false) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,private AS $$
DECLARE sid uuid:=private.request_auth_session_id_v1(); principal uuid:=auth.uid(); connection public.connected_client_sessions;
 proof text;
BEGIN
 -- A refreshed JWT cannot turn a pre-cutover auth session into a new session.
 IF principal IS NULL OR sid IS NULL OR NOT EXISTS(
  SELECT 1 FROM auth.sessions s CROSS JOIN private.api_session_boundary b
  WHERE s.id=sid AND s.user_id=principal AND s.created_at>=b.sessions_not_before
   AND (s.not_after IS NULL OR s.not_after>now())) THEN RETURN false; END IF;
 SELECT * INTO connection FROM public.connected_client_sessions WHERE auth_session_id=sid;
 IF NOT FOUND THEN RETURN true; END IF;
 IF p_first_party_only OR connection.credential_version<>2 OR connection.revoked_at IS NOT NULL
  OR connection.user_id<>principal OR connection.refresh_token_expires_at<=now() THEN RETURN false; END IF;
 proof:=nullif(current_setting('request.headers',true),'')::jsonb->>'x-connect-backend-proof';
 IF proof IS NULL OR encode(sha256(convert_to(proof,'UTF8')),'hex')<>connection.backend_proof_hash THEN RETURN false; END IF;
 RETURN EXISTS(SELECT 1 FROM public.connected_clients c JOIN public.connected_client_grants g ON g.client_id=c.client_id
  WHERE c.client_id=connection.client_id AND c.status='active' AND g.user_id=principal AND g.revoked_at IS NULL AND g.authority_revision=connection.grant_revision
   AND connection.scopes <@ g.scopes AND connection.scopes <@ c.allowed_scopes);
END;
$$;
REVOKE ALL ON FUNCTION private.api_session_allowed_v1(boolean) FROM PUBLIC,anon,authenticated,service_role;
-- RLS policy entrypoint: fixed boolean argument is not a privilege selector.
GRANT EXECUTE ON FUNCTION private.api_session_allowed_v1(boolean) TO authenticated;
CREATE FUNCTION public.check_first_party_session_v1() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT private.api_session_allowed_v1(true);
$$;
REVOKE ALL ON FUNCTION public.check_first_party_session_v1() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.check_first_party_session_v1() TO authenticated;

CREATE OR REPLACE FUNCTION public.admission_enforce() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF current_setting('role',true)='authenticated' AND NOT private.api_session_allowed_v1(false) THEN
  RAISE EXCEPTION 'session_reauthentication_required' USING ERRCODE='42501'; END IF;
 IF current_setting('role',true) IN ('anon','authenticated')
  AND NOT(current_setting('role',true)='authenticated' AND coalesce(current_setting('request.path',true),'')='/rpc/admission_request')
  AND NOT coalesce(private.admission_allowed((SELECT auth.uid())),false) THEN
  RAISE EXCEPTION 'admission_required' USING ERRCODE='42501'; END IF;
END;
$$;
-- Realtime does not invoke the PostgREST pre-request hook.
CREATE POLICY api_session_fence ON realtime.messages AS RESTRICTIVE TO authenticated
 USING (private.api_session_allowed_v1(true)) WITH CHECK (private.api_session_allowed_v1(true));

-- Postgres Changes and other RLS consumers do not run the HTTP pre-request
-- hook either. Protect table reads/writes independently, including new tables.
CREATE FUNCTION private.attach_api_session_fences_v1() RETURNS event_trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE t record;
BEGIN
 FOR t IN SELECT c.oid,n.nspname,c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relkind IN ('r','p') AND c.relrowsecurity
   AND (EXISTS(SELECT 1 FROM pg_policy p WHERE p.polrelid=c.oid AND p.polpermissive)
    OR has_any_column_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE')
    OR has_table_privilege('authenticated',c.oid,'DELETE'))
   AND NOT EXISTS(SELECT 1 FROM pg_policy p WHERE p.polrelid=c.oid AND p.polname='api_session_fence') LOOP
  EXECUTE format('CREATE POLICY api_session_fence ON %I.%I AS RESTRICTIVE TO authenticated USING ((SELECT private.api_session_allowed_v1(false))) WITH CHECK ((SELECT private.api_session_allowed_v1(false)))',t.nspname,t.relname);
 END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION private.attach_api_session_fences_v1() FROM PUBLIC,anon,authenticated,service_role;
CREATE EVENT TRIGGER api_session_new_table_fence ON ddl_command_end
 WHEN TAG IN ('CREATE TABLE','ALTER TABLE','GRANT','REVOKE') EXECUTE FUNCTION private.attach_api_session_fences_v1();
-- Trigger an initial pass without changing application permissions.
REVOKE ALL ON private.api_session_boundary FROM PUBLIC;

-- Serialize final issuance/refresh against grant revocation and validate the
-- stable provider identity before accepting a server credential envelope.
CREATE FUNCTION private.validate_connected_session_v2() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,private AS $$
BEGIN
 IF NEW.credential_version=2 AND NEW.revoked_at IS NULL THEN
  IF NOT EXISTS(SELECT 1 FROM auth.sessions s CROSS JOIN private.api_session_boundary b
   WHERE s.id=NEW.auth_session_id AND s.user_id=NEW.user_id AND s.created_at>=b.sessions_not_before
    AND (s.not_after IS NULL OR s.not_after>now())) THEN
   RAISE EXCEPTION 'invalid_provider_session' USING ERRCODE='42501'; END IF;
  PERFORM 1 FROM public.connected_clients WHERE client_id=NEW.client_id AND status='active'
   AND NEW.scopes <@ allowed_scopes FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'invalid_connected_client' USING ERRCODE='42501'; END IF;
  PERFORM 1 FROM public.connected_client_grants WHERE client_id=NEW.client_id AND user_id=NEW.user_id
   AND revoked_at IS NULL AND NEW.scopes <@ scopes AND authority_revision=NEW.grant_revision FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'invalid_connected_grant' USING ERRCODE='42501'; END IF;
 END IF;
 IF TG_OP='UPDATE' AND OLD.credential_version=2 AND (
  NEW.auth_session_id IS DISTINCT FROM OLD.auth_session_id OR NEW.grant_revision IS DISTINCT FROM OLD.grant_revision
  OR NOT OLD.refresh_token_family_hashes <@ NEW.refresh_token_family_hashes OR NEW.user_id<>OLD.user_id
  OR NEW.client_id<>OLD.client_id OR NEW.credential_version<>2 OR NEW.backend_proof_hash<>OLD.backend_proof_hash
  OR (OLD.revoked_at IS NOT NULL AND NEW.revoked_at IS NULL)) THEN
  RAISE EXCEPTION 'immutable_connected_session' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.validate_connected_session_v2() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER connected_session_v2_guard BEFORE INSERT OR UPDATE ON public.connected_client_sessions
 FOR EACH ROW EXECUTE FUNCTION private.validate_connected_session_v2();
NOTIFY pgrst,'reload schema';
COMMIT;
