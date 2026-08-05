-- Let the service-only Platform V2 boundary reuse authenticated scheduler
-- mutations after it has already resolved and authorized the principal.
-- The delegated functions still verify the authenticated principal, so scope the asserted user
-- claim to this transaction before entering the existing action boundary.

CREATE OR REPLACE FUNCTION public.perform_platform_v2_card_action_as_principal(
    p_user_id uuid,
    p_action_id text,
    p_entry_id uuid,
    p_card_type_id text,
    p_state_revision text,
    p_active_known_mark_id uuid,
    p_known_mark_revision text,
    p_review_result text,
    p_client_event_id uuid,
    p_source_context jsonb,
    p_auth_kind text,
    p_connected_client_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, extensions, pg_temp
AS $$
DECLARE
    v_jwt_role text := COALESCE(
        NULLIF(current_setting('request.jwt.claim.role', true), ''),
        (
            NULLIF(current_setting('request.jwt.claims', true), '')::jsonb
        )->>'role'
    );
BEGIN
    IF v_jwt_role IS DISTINCT FROM 'service_role' THEN
        RAISE EXCEPTION 'unauthorized';
    END IF;
    IF p_user_id IS NULL THEN
        RAISE EXCEPTION 'missing_user_id';
    END IF;

    PERFORM set_config('request.jwt.claim.sub', p_user_id::text, true);

    RETURN public.perform_platform_v2_card_action(
        p_user_id,
        p_action_id,
        p_entry_id,
        p_card_type_id,
        p_state_revision,
        p_active_known_mark_id,
        p_known_mark_revision,
        p_review_result,
        p_client_event_id,
        p_source_context,
        p_auth_kind,
        p_connected_client_id
    );
END;
$$;

REVOKE ALL ON FUNCTION public.perform_platform_v2_card_action_as_principal(
    uuid,
    text,
    uuid,
    text,
    text,
    uuid,
    text,
    text,
    uuid,
    jsonb,
    text,
    text
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.perform_platform_v2_card_action_as_principal(
    uuid,
    text,
    uuid,
    text,
    text,
    uuid,
    text,
    text,
    uuid,
    jsonb,
    text,
    text
) TO service_role;
