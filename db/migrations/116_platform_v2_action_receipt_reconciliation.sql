-- Resolve an ambiguous Platform V2 mutation without repeating it indefinitely.
-- The lock key matches the mutation RPC, so this read waits for an in-flight
-- action using the same client event id to commit or roll back first.

CREATE OR REPLACE FUNCTION public.reconcile_platform_v2_action_receipt_as_principal(
    p_user_id uuid,
    p_client_event_id uuid
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
    v_response jsonb;
BEGIN
    IF v_jwt_role IS DISTINCT FROM 'service_role' THEN
        RAISE EXCEPTION 'unauthorized';
    END IF;
    IF p_user_id IS NULL THEN
        RAISE EXCEPTION 'missing_user_id';
    END IF;

    PERFORM pg_advisory_xact_lock(
        hashtext(p_user_id::text || ':' || p_client_event_id::text)
    );

    SELECT response
      INTO v_response
      FROM public.platform_v2_action_receipts
     WHERE user_id = p_user_id
       AND client_event_id = p_client_event_id;

    RETURN v_response;
END;
$$;

REVOKE ALL ON FUNCTION public.reconcile_platform_v2_action_receipt_as_principal(
    uuid,
    uuid
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.reconcile_platform_v2_action_receipt_as_principal(
    uuid,
    uuid
) TO service_role;
