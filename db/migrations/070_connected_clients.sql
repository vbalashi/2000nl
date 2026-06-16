-- 2000NL Connect: registered external clients, user grants, one-time codes,
-- and refresh-session tracking for Connected Client Sessions.

CREATE TABLE IF NOT EXISTS connected_clients (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id text NOT NULL UNIQUE,
    display_name text NOT NULL,
    client_type text NOT NULL CHECK (client_type IN ('chrome_extension', 'web_app', 'server_web_app', 'native_app')),
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
    allowed_redirect_uris text[] NOT NULL DEFAULT '{}',
    allowed_origins text[] NOT NULL DEFAULT '{}',
    allowed_scopes text[] NOT NULL DEFAULT '{}',
    requires_pkce boolean NOT NULL DEFAULT true,
    client_secret_hash text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CHECK (array_length(allowed_redirect_uris, 1) IS NOT NULL),
    CHECK (array_length(allowed_scopes, 1) IS NOT NULL),
    CHECK (
        client_type != 'server_web_app'
        OR client_secret_hash IS NOT NULL
    )
);

CREATE TABLE IF NOT EXISTS connected_client_grants (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id text NOT NULL REFERENCES connected_clients(client_id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    scopes text[] NOT NULL DEFAULT '{}',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    last_used_at timestamptz,
    revoked_at timestamptz,
    UNIQUE (client_id, user_id)
);

CREATE TABLE IF NOT EXISTS connect_authorization_codes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code_hash text NOT NULL UNIQUE,
    client_id text NOT NULL REFERENCES connected_clients(client_id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    user_email text NOT NULL,
    redirect_uri text NOT NULL,
    scopes text[] NOT NULL DEFAULT '{}',
    code_challenge text NOT NULL,
    code_challenge_method text NOT NULL DEFAULT 'S256',
    expires_at timestamptz NOT NULL,
    used_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS connect_authorization_codes_code_hash_idx
    ON connect_authorization_codes (code_hash);

CREATE INDEX IF NOT EXISTS connect_authorization_codes_expires_at_idx
    ON connect_authorization_codes (expires_at);

CREATE TABLE IF NOT EXISTS connected_client_sessions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    refresh_token_hash text NOT NULL UNIQUE,
    client_id text NOT NULL REFERENCES connected_clients(client_id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    scopes text[] NOT NULL DEFAULT '{}',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    last_refreshed_at timestamptz,
    revoked_at timestamptz
);

CREATE INDEX IF NOT EXISTS connected_client_sessions_client_user_idx
    ON connected_client_sessions (client_id, user_id);

ALTER TABLE connected_clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE connected_client_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE connect_authorization_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE connected_client_sessions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON connected_clients FROM anon, authenticated;
REVOKE ALL ON connected_client_grants FROM anon, authenticated;
REVOKE ALL ON connect_authorization_codes FROM anon, authenticated;
REVOKE ALL ON connected_client_sessions FROM anon, authenticated;
