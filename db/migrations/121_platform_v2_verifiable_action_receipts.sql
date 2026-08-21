BEGIN;

ALTER TABLE public.platform_v2_action_receipts
    ADD COLUMN IF NOT EXISTS request_projection jsonb;

COMMENT ON COLUMN public.platform_v2_action_receipts.request_projection IS
    'Immutable platform-action-report-verification-v1 projection of the accepted original request; null receipts predate verifiable history and fail closed.';

DO $$
BEGIN
    IF to_regprocedure(
        'private.perform_platform_v2_card_action_without_verifiable_receipt(uuid,text,uuid,text,text,uuid,text,text,uuid,jsonb,text,text)'
    ) IS NULL THEN
        IF to_regprocedure(
            'public.perform_platform_v2_card_action_without_verifiable_receipt(uuid,text,uuid,text,text,uuid,text,text,uuid,jsonb,text,text)'
        ) IS NULL THEN
            ALTER FUNCTION public.perform_platform_v2_card_action(
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
            ) RENAME TO perform_platform_v2_card_action_without_verifiable_receipt;
        END IF;
        ALTER FUNCTION
            public.perform_platform_v2_card_action_without_verifiable_receipt(
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
            )
        SET SCHEMA private;
    END IF;
END;
$$;

REVOKE ALL ON FUNCTION
    private.perform_platform_v2_card_action_without_verifiable_receipt(
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
    )
FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.perform_platform_v2_card_action(
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
    v_response jsonb;
    v_request_projection jsonb;
BEGIN
    v_response := private.perform_platform_v2_card_action_without_verifiable_receipt(
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

    IF v_response->>'status' = 'accepted' THEN
        v_request_projection := jsonb_build_object(
            'contractVersion', 'platform-action-report-verification-v1',
            'entryId', p_entry_id,
            'cardTypeId', p_card_type_id,
            'stateRevision', p_state_revision,
            'actionId', p_action_id,
            'clientEventId', p_client_event_id,
            'reviewResult', CASE
                WHEN p_action_id = 'review-card' THEN p_review_result
                ELSE NULL
            END,
            'activeKnownMarkId', CASE
                WHEN p_action_id = 'undo-known'
                    THEN p_active_known_mark_id
                ELSE NULL
            END,
            'knownMarkRevision', CASE
                WHEN p_action_id = 'undo-known'
                    THEN p_known_mark_revision
                ELSE NULL
            END
        );

        UPDATE public.platform_v2_action_receipts
           SET request_projection = v_request_projection
         WHERE user_id = p_user_id
           AND client_event_id = p_client_event_id
           AND request_projection IS NULL;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'platform_action_receipt_projection_missing';
        END IF;
    END IF;

    RETURN v_response;
END;
$$;

REVOKE ALL ON FUNCTION public.perform_platform_v2_card_action(
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

GRANT EXECUTE ON FUNCTION public.perform_platform_v2_card_action(
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

CREATE OR REPLACE FUNCTION private.reject_action_receipt_projection_rewrite()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, private, extensions, pg_temp
AS $$
BEGIN
    IF OLD.request_projection IS NOT NULL
       AND NEW.request_projection IS DISTINCT FROM OLD.request_projection THEN
        RAISE EXCEPTION 'platform_action_receipt_projection_immutable';
    END IF;
    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.reject_action_receipt_projection_rewrite()
FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS reject_action_receipt_projection_rewrite
    ON public.platform_v2_action_receipts;

CREATE TRIGGER reject_action_receipt_projection_rewrite
BEFORE UPDATE OF request_projection ON public.platform_v2_action_receipts
FOR EACH ROW
EXECUTE FUNCTION private.reject_action_receipt_projection_rewrite();

CREATE OR REPLACE FUNCTION public.verify_platform_v2_action_receipt_as_principal(
    p_user_id uuid,
    p_request_projection jsonb
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, extensions, pg_temp
AS $$
DECLARE
    v_action_id text;
    v_client_event_id uuid;
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
    IF jsonb_typeof(p_request_projection) IS DISTINCT FROM 'object'
       OR (
           SELECT count(*)
             FROM jsonb_object_keys(p_request_projection)
       ) <> 9
       OR NOT p_request_projection ?& ARRAY[
           'contractVersion',
           'entryId',
           'cardTypeId',
           'stateRevision',
           'actionId',
           'clientEventId',
           'reviewResult',
           'activeKnownMarkId',
           'knownMarkRevision'
       ]
       OR p_request_projection->>'contractVersion'
           IS DISTINCT FROM 'platform-action-report-verification-v1' THEN
        RETURN false;
    END IF;

    v_action_id := p_request_projection->>'actionId';
    IF v_action_id NOT IN (
        'start-learning',
        'mark-known',
        'undo-known',
        'review-card'
    ) THEN
        RETURN false;
    END IF;
    IF v_action_id = 'review-card' THEN
        IF p_request_projection->>'reviewResult'
               NOT IN ('fail', 'hard', 'success', 'easy')
           OR p_request_projection->'activeKnownMarkId' <> 'null'::jsonb
           OR p_request_projection->'knownMarkRevision' <> 'null'::jsonb THEN
            RETURN false;
        END IF;
    ELSIF v_action_id = 'undo-known' THEN
        IF p_request_projection->'reviewResult' <> 'null'::jsonb
           OR jsonb_typeof(p_request_projection->'activeKnownMarkId')
               IS DISTINCT FROM 'string'
           OR jsonb_typeof(p_request_projection->'knownMarkRevision')
               IS DISTINCT FROM 'string' THEN
            RETURN false;
        END IF;
    ELSIF p_request_projection->'reviewResult' <> 'null'::jsonb
       OR p_request_projection->'activeKnownMarkId' <> 'null'::jsonb
       OR p_request_projection->'knownMarkRevision' <> 'null'::jsonb THEN
        RETURN false;
    END IF;

    BEGIN
        v_client_event_id := (p_request_projection->>'clientEventId')::uuid;
        PERFORM (p_request_projection->>'entryId')::uuid;
    EXCEPTION
        WHEN invalid_text_representation THEN
            RETURN false;
    END;

    PERFORM pg_advisory_xact_lock(
        hashtext(p_user_id::text || ':' || v_client_event_id::text)
    );

    RETURN EXISTS (
        SELECT 1
          FROM public.platform_v2_action_receipts receipt
         WHERE receipt.user_id = p_user_id
           AND receipt.client_event_id = v_client_event_id
           AND receipt.request_projection = p_request_projection
    );
END;
$$;

REVOKE ALL ON FUNCTION public.verify_platform_v2_action_receipt_as_principal(
    uuid,
    jsonb
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.verify_platform_v2_action_receipt_as_principal(
    uuid,
    jsonb
) TO service_role;

COMMIT;
