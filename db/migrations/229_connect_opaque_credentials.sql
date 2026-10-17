-- Additive storage only. Legacy native-session retirement is a held release
-- prerequisite; this migration intentionally does not revoke Auth sessions.
ALTER TABLE public.connected_client_sessions
  ADD COLUMN credential_version integer NOT NULL DEFAULT 1,
  ADD COLUMN native_session_ciphertext text,
  ADD COLUMN refresh_token_expires_at timestamptz,
  ADD COLUMN refresh_claim_id uuid;
ALTER TABLE public.connected_client_sessions
  ADD CONSTRAINT connected_client_credential_version_check CHECK (credential_version IN (1, 2)),
  ADD CONSTRAINT connected_client_v2_credentials_check CHECK (
    credential_version <> 2 OR (
      access_token_hash IS NOT NULL AND access_token_expires_at IS NOT NULL
      AND native_session_ciphertext IS NOT NULL
    )
  );
-- Explicit defense in depth; no browser/client role may see native ciphertext.
REVOKE ALL ON public.connected_client_sessions FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.connected_client_sessions TO service_role;
