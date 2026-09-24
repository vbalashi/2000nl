BEGIN;

CREATE TABLE IF NOT EXISTS public.admin_operators (
    email text PRIMARY KEY,
    user_id uuid UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
    is_active boolean NOT NULL DEFAULT false,
    permissions text[] NOT NULL DEFAULT ARRAY[]::text[],
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT admin_operators_email_normalized
        CHECK (email = lower(btrim(email)) AND email <> ''),
    CONSTRAINT admin_operators_permissions_allowed
        CHECK (permissions <@ ARRAY['dictionaries.read', 'audit.read']::text[])
);

CREATE TABLE IF NOT EXISTS public.admin_operator_sessions (
    auth_session_id uuid PRIMARY KEY,
    operator_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    started_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL,
    revoked_at timestamptz,
    CONSTRAINT admin_operator_sessions_expiry_after_start
        CHECK (expires_at > started_at)
);

CREATE INDEX IF NOT EXISTS admin_operator_sessions_user_expiry_idx
    ON public.admin_operator_sessions (operator_user_id, expires_at DESC);

CREATE TABLE IF NOT EXISTS public.admin_audit_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at timestamptz NOT NULL DEFAULT now(),
    operator_user_id uuid,
    action text NOT NULL,
    outcome text NOT NULL,
    target_type text,
    target_id text,
    request_id uuid NOT NULL,
    client_ip inet,
    user_agent text,
    CONSTRAINT admin_audit_events_action_allowed CHECK (action IN (
        'auth.sign_in',
        'auth.sign_in_denied',
        'auth.sign_out',
        'access.denied',
        'dictionary.registry.read',
        'dictionary.metadata.read',
        'audit.journal.read'
    )),
    CONSTRAINT admin_audit_events_outcome_allowed
        CHECK (outcome IN ('success', 'denied', 'failure')),
    CONSTRAINT admin_audit_events_user_agent_bounded
        CHECK (user_agent IS NULL OR char_length(user_agent) <= 1024),
    CONSTRAINT admin_audit_events_target_type_bounded
        CHECK (target_type IS NULL OR char_length(target_type) <= 80),
    CONSTRAINT admin_audit_events_target_id_bounded
        CHECK (target_id IS NULL OR char_length(target_id) <= 160)
);

CREATE INDEX IF NOT EXISTS admin_audit_events_created_at_idx
    ON public.admin_audit_events (created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS admin_audit_events_action_created_at_idx
    ON public.admin_audit_events (action, created_at DESC, id DESC);

ALTER TABLE public.admin_operators ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_operator_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_audit_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.admin_operators FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.admin_operator_sessions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.admin_audit_events FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.admin_operators TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_operator_sessions TO service_role;
GRANT SELECT, INSERT ON public.admin_audit_events TO service_role;
REVOKE UPDATE, DELETE, TRUNCATE ON public.admin_audit_events FROM service_role;

CREATE OR REPLACE FUNCTION public.set_default_user_settings()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    -- A manually allowlisted operator signs in with a dedicated Auth identity.
    -- Do not create a learner settings row for that identity.
    IF EXISTS (
        SELECT 1
          FROM public.admin_operators AS op
         WHERE op.email = lower(btrim(new.email))
           AND op.is_active
    ) THEN
        RETURN new;
    END IF;

    INSERT INTO public.user_settings (user_id)
    VALUES (new.id)
    ON CONFLICT DO NOTHING;
    RETURN new;
END;
$$;

REVOKE ALL ON FUNCTION public.set_default_user_settings() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_default_user_settings() TO supabase_auth_admin;

-- Supabase provides pg_cron. Plain-Postgres drift CI provides a narrow cron
-- stub; production/local Supabase installs the real extension when needed.
DO $install_pg_cron_if_missing$
BEGIN
    IF to_regclass('cron.job') IS NULL THEN
        EXECUTE 'CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog';
    END IF;
END
$install_pg_cron_if_missing$;

SELECT cron.schedule(
    'admin-audit-retention-365-days',
    '17 3 * * *',
    $cron$DELETE FROM public.admin_audit_events
          WHERE created_at < now() - interval '365 days'$cron$
);

COMMIT;
