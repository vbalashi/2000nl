-- Explicit RPC ACLs and bounded provider housekeeping. No scheduling or activation.
-- Preserve the existing anon/authenticated/service callers while removing the
-- implicit PUBLIC capability inherited by unrelated database login roles.
BEGIN;
REVOKE EXECUTE ON FUNCTION public.fetch_words_for_list_gated(uuid,text,text,text,boolean,boolean,boolean,integer,integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.can_access_dictionary(uuid,uuid,text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fetch_dictionary_entry_gated(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.perform_platform_card_action(uuid,uuid,text,text,text,uuid,text,jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.perform_platform_card_action(uuid,uuid,text,text,text,uuid,text,jsonb,text,text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.can_browse_dictionary(uuid,uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.can_browse_dictionary(uuid,uuid,text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.fetch_words_for_list_gated(uuid,text,text,text,boolean,boolean,boolean,integer,integer) TO anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.can_access_dictionary(uuid,uuid,text) TO anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.fetch_dictionary_entry_gated(text) TO anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.perform_platform_card_action(uuid,uuid,text,text,text,uuid,text,jsonb) TO anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.perform_platform_card_action(uuid,uuid,text,text,text,uuid,text,jsonb,text,text) TO anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.can_browse_dictionary(uuid,uuid) TO anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.can_browse_dictionary(uuid,uuid,text) TO anon,authenticated,service_role;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'provider_housekeeping') THEN
    CREATE ROLE provider_housekeeping NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
  ELSE
    RAISE EXCEPTION 'provider_housekeeping role already exists; review ownership before migration';
  END IF;
END $$;

CREATE SCHEMA provider_housekeeping;
REVOKE ALL ON SCHEMA provider_housekeeping FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION provider_housekeeping.run_provider_housekeeping_v1(expected_system_identifier text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, private, pg_temp AS $$
DECLARE
  cutoff timestamptz := clock_timestamp();
  windows_deleted integer; pending_deleted integer; failed_deleted integer;
  windows_oldest timestamptz; pending_oldest timestamptz; failed_oldest timestamptz;
  windows_backlog integer; pending_backlog integer; failed_backlog integer;
BEGIN
  IF expected_system_identifier IS NULL OR expected_system_identifier !~ '^[0-9]{1,20}$' OR
    (SELECT system_identifier::text FROM pg_control_system()) <> expected_system_identifier THEN
    RAISE EXCEPTION 'provider_housekeeping_wrong_database' USING ERRCODE = '42501';
  END IF;
  -- A second invocation never waits on or overlaps the first.
  IF NOT pg_try_advisory_xact_lock(hashtextextended('2000nl:provider-housekeeping:v1', 0)) THEN
    RAISE EXCEPTION 'provider_housekeeping_overlap' USING ERRCODE = '55P03';
  END IF;
  WITH selected AS (
    SELECT family, subject FROM private.provider_admission_windows
    WHERE window_started_at < cutoff - interval '1 day'
    ORDER BY window_started_at, family, subject LIMIT 1000 FOR UPDATE SKIP LOCKED
  ) DELETE FROM private.provider_admission_windows a USING selected s
    WHERE a.family = s.family AND a.subject = s.subject;
  GET DIAGNOSTICS windows_deleted = ROW_COUNT;
  WITH selected AS (
    SELECT kind, identity FROM private.provider_work
    WHERE status = 'pending' AND lease_expires_at < cutoff - interval '1 day'
    ORDER BY lease_expires_at, kind, identity LIMIT 1000 FOR UPDATE SKIP LOCKED
  ) DELETE FROM private.provider_work w USING selected s
    WHERE w.kind = s.kind AND w.identity = s.identity;
  GET DIAGNOSTICS pending_deleted = ROW_COUNT;
  WITH selected AS (
    SELECT kind, identity FROM private.provider_work
    WHERE status = 'failed' AND updated_at < cutoff - interval '7 days'
    ORDER BY updated_at, kind, identity LIMIT 1000 FOR UPDATE SKIP LOCKED
  ) DELETE FROM private.provider_work w USING selected s
    WHERE w.kind = s.kind AND w.identity = s.identity;
  GET DIAGNOSTICS failed_deleted = ROW_COUNT;
  SELECT min(window_started_at) INTO windows_oldest FROM private.provider_admission_windows
    WHERE window_started_at < cutoff - interval '1 day';
  SELECT min(lease_expires_at) INTO pending_oldest FROM private.provider_work
    WHERE status = 'pending' AND lease_expires_at < cutoff - interval '1 day';
  SELECT min(updated_at) INTO failed_oldest FROM private.provider_work
    WHERE status = 'failed' AND updated_at < cutoff - interval '7 days';
  -- Count at most 1001 per category; 1001 means at least 1001.
  SELECT count(*) INTO windows_backlog FROM (SELECT 1 FROM private.provider_admission_windows WHERE window_started_at < cutoff - interval '1 day' LIMIT 1001) q;
  SELECT count(*) INTO pending_backlog FROM (SELECT 1 FROM private.provider_work WHERE status = 'pending' AND lease_expires_at < cutoff - interval '1 day' LIMIT 1001) q;
  SELECT count(*) INTO failed_backlog FROM (SELECT 1 FROM private.provider_work WHERE status = 'failed' AND updated_at < cutoff - interval '7 days' LIMIT 1001) q;
  RETURN jsonb_build_object('cutoff', cutoff,
    'deleted', jsonb_build_object('windows', windows_deleted, 'pending', pending_deleted, 'failed', failed_deleted),
    'backlogCappedAt1001', jsonb_build_object('windows', windows_backlog, 'pending', pending_backlog, 'failed', failed_backlog),
    'oldestEligible', jsonb_build_object('windows', windows_oldest, 'pending', pending_oldest, 'failed', failed_oldest));
END $$;
-- Inspect only the number of matching worker backends; no query text or identity is returned.
CREATE FUNCTION provider_housekeeping.inspect_provider_housekeeping_v1(expected_system_identifier text) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  IF expected_system_identifier IS NULL OR expected_system_identifier !~ '^[0-9]{1,20}$' OR
    (SELECT system_identifier::text FROM pg_control_system()) <> expected_system_identifier THEN
    RAISE EXCEPTION 'provider_housekeeping_wrong_database' USING ERRCODE = '42501';
  END IF;
  RETURN (SELECT count(*)::integer FROM pg_stat_activity WHERE datname = current_database()
    AND application_name = '2000nl-provider-housekeeping' AND backend_type = 'client backend'
    AND pid <> pg_backend_pid());
END $$;
REVOKE ALL ON FUNCTION provider_housekeeping.inspect_provider_housekeeping_v1(text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION provider_housekeeping.inspect_provider_housekeeping_v1(text) TO provider_housekeeping;
REVOKE ALL ON FUNCTION provider_housekeeping.run_provider_housekeeping_v1(text) FROM PUBLIC, anon, authenticated, service_role;
GRANT USAGE ON SCHEMA provider_housekeeping TO provider_housekeeping;
GRANT EXECUTE ON FUNCTION provider_housekeeping.run_provider_housekeeping_v1(text) TO provider_housekeeping;
COMMENT ON FUNCTION provider_housekeeping.run_provider_housekeeping_v1(text) IS 'Bounded server-side operational retention; returns counts and oldest eligible timestamps only.';
COMMIT;
