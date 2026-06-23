-- Bind Platform API requests to server-derived Connected Client identity.

ALTER TABLE connected_client_sessions
    ADD COLUMN IF NOT EXISTS access_token_hash text,
    ADD COLUMN IF NOT EXISTS access_token_expires_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS connected_client_sessions_access_token_hash_idx
    ON connected_client_sessions (access_token_hash)
    WHERE access_token_hash IS NOT NULL;

ALTER TABLE user_card_action_events
    ADD COLUMN IF NOT EXISTS auth_kind text NOT NULL DEFAULT 'first_party',
    ADD COLUMN IF NOT EXISTS connected_client_id text REFERENCES connected_clients(client_id) ON DELETE SET NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'user_card_action_events_auth_kind_check'
    ) THEN
        ALTER TABLE user_card_action_events
            ADD CONSTRAINT user_card_action_events_auth_kind_check
            CHECK (auth_kind IN ('first_party', 'connected_client'));
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS user_card_action_events_connected_client_date_idx
    ON user_card_action_events(user_id, connected_client_id, created_at DESC)
    WHERE connected_client_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.perform_platform_card_action(
    p_user_id uuid,
    p_entry_id uuid,
    p_card_type_id text,
    p_action text,
    p_result text,
    p_turn_id uuid,
    p_client_event_id text,
    p_source_context jsonb,
    p_auth_kind text,
    p_connected_client_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE
    v_result jsonb;
    v_event_id uuid;
    v_auth_kind text;
    v_connected_client_id text;
BEGIN
    v_auth_kind := COALESCE(NULLIF(trim(p_auth_kind), ''), 'first_party');
    IF v_auth_kind NOT IN ('first_party', 'connected_client') THEN
        RAISE EXCEPTION 'invalid_platform_auth_kind';
    END IF;

    IF v_auth_kind = 'connected_client' THEN
        v_connected_client_id := NULLIF(trim(p_connected_client_id), '');
        IF v_connected_client_id IS NULL THEN
            RAISE EXCEPTION 'missing_connected_client_id';
        END IF;
    ELSE
        v_connected_client_id := NULL;
    END IF;

    v_result := public.perform_platform_card_action(
        p_user_id,
        p_entry_id,
        p_card_type_id,
        p_action,
        p_result,
        p_turn_id,
        p_client_event_id,
        p_source_context
    );

    IF v_result ? 'eventId' THEN
        v_event_id := (v_result->>'eventId')::uuid;
        UPDATE user_card_action_events
        SET auth_kind = v_auth_kind,
            connected_client_id = v_connected_client_id
        WHERE id = v_event_id
          AND user_id = p_user_id;
    END IF;

    RETURN v_result || jsonb_build_object(
        'authKind', v_auth_kind,
        'connectedClientId', v_connected_client_id
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.perform_platform_card_action(
    uuid,
    uuid,
    text,
    text,
    text,
    uuid,
    text,
    jsonb,
    text,
    text
) TO authenticated;
