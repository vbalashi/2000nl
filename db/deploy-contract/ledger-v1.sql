-- Pre-managed migration ledger. This contract-owned schema must exist before
-- the first numbered migration can be applied and recorded atomically.

BEGIN;

CREATE TABLE IF NOT EXISTS public.app_db_contract_migrations (
  migration_id integer PRIMARY KEY,
  filename text NOT NULL UNIQUE,
  checksum_sha256 text NOT NULL CHECK (checksum_sha256 ~ '^[0-9a-f]{64}$'),
  contract_id text NOT NULL,
  app_commit text NOT NULL CHECK (app_commit ~ '^[0-9a-f]{40}$'),
  applied_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE IF NOT EXISTS public.app_db_contract_state (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  contract_id text NOT NULL,
  migration_id integer NOT NULL,
  app_commit text NOT NULL CHECK (app_commit ~ '^[0-9a-f]{40}$'),
  verified_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

ALTER TABLE public.app_db_contract_migrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_db_contract_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.app_db_contract_migrations
FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.app_db_contract_state
FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.app_db_contract_state TO service_role;

COMMIT;
