-- Read-only postflight for migration229. This verifies storage only and does not
-- establish retirement of historical native Auth credentials or clear HOLD.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_attribute
    WHERE attrelid='public.connected_client_sessions'::regclass
      AND attname='credential_version' AND atttypid='integer'::regtype
      AND attnotnull AND NOT attisdropped
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_attribute
    WHERE attrelid='public.connected_client_sessions'::regclass
      AND attname='native_session_ciphertext' AND atttypid='text'::regtype
      AND NOT attisdropped
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_attribute
    WHERE attrelid='public.connected_client_sessions'::regclass
      AND attname='refresh_token_expires_at' AND atttypid='timestamptz'::regtype
      AND NOT attisdropped
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_attribute
    WHERE attrelid='public.connected_client_sessions'::regclass
      AND attname='refresh_claim_id' AND atttypid='uuid'::regtype
      AND NOT attisdropped
  ) THEN RAISE EXCEPTION 'connect_opaque_credential_columns_missing'; END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE oid='public.connected_client_sessions'::regclass AND relrowsecurity)
    OR has_table_privilege('anon','public.connected_client_sessions','SELECT,INSERT,UPDATE,DELETE')
    OR has_table_privilege('authenticated','public.connected_client_sessions','SELECT,INSERT,UPDATE,DELETE')
    OR EXISTS (SELECT 1 FROM unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE']) AS required(privilege)
      WHERE NOT has_table_privilege('service_role','public.connected_client_sessions',required.privilege))
  THEN RAISE EXCEPTION 'connect_opaque_credential_acl_mismatch'; END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.connected_client_sessions'::regclass AND conname='connected_client_v2_credentials_check' AND convalidated)
    OR NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.connected_client_sessions'::regclass AND conname='connected_client_credential_version_check' AND convalidated)
  THEN RAISE EXCEPTION 'connect_opaque_credential_constraints_missing'; END IF;
END $$;
