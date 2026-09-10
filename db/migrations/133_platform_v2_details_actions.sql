-- Give Training Word Details an explicit V2 action boundary for the two
-- non-FSRS controls that used to call the legacy review port.
--
-- These actions intentionally reuse handle_card_review's existing freeze/hide
-- semantics. They do not create an FSRS review and do not alter scheduling.

BEGIN;

CREATE OR REPLACE FUNCTION public.perform_platform_v2_details_action(
    p_user_id uuid,
    p_action_id text,
    p_entry_id uuid,
    p_card_type_id text,
    p_state_revision text,
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
        (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb)->>'role'
    );
    v_dictionary_id uuid;
    v_state_revision text;
    v_known boolean;
    v_event_id uuid := gen_random_uuid();
    v_payload jsonb;
    v_payload_hash text;
    v_existing public.platform_v2_action_receipts%rowtype;
    v_response jsonb;
    v_result text;
    v_auth_kind text := COALESCE(NULLIF(trim(p_auth_kind), ''), 'first_party');
    v_connected_client_id text := NULLIF(trim(p_connected_client_id), '');
    v_request_projection jsonb;
BEGIN
    IF NOT (
        ((select auth.uid()) IS NOT NULL AND p_user_id IS NOT DISTINCT FROM (select auth.uid()))
        OR v_jwt_role = 'service_role'
    ) THEN
        RAISE EXCEPTION 'unauthorized';
    END IF;
    IF p_action_id NOT IN ('freeze-card', 'hide-card') THEN
        RAISE EXCEPTION 'unsupported_action';
    END IF;
    IF p_client_event_id IS NULL THEN
        RAISE EXCEPTION 'missing_client_event_id';
    END IF;
    IF v_auth_kind NOT IN ('first_party', 'connected_client') THEN
        RAISE EXCEPTION 'invalid_platform_auth_kind';
    END IF;
    IF v_auth_kind = 'connected_client'
       AND v_connected_client_id IS NULL THEN
        RAISE EXCEPTION 'missing_connected_client_id';
    END IF;
    IF v_auth_kind = 'connected_client'
       AND NOT EXISTS (
           SELECT 1
             FROM public.connected_clients c
             JOIN public.connected_client_grants g ON g.client_id = c.client_id
            WHERE c.client_id = v_connected_client_id
              AND c.status = 'active'
              AND g.user_id = p_user_id
              AND g.revoked_at IS NULL
              AND 'platform:write' = ANY(g.scopes)
       ) THEN
       RAISE EXCEPTION 'invalid_connected_client_grant';
    END IF;
    IF v_auth_kind = 'connected_client'
       AND NULLIF(p_source_context#>>'{client,id}', '') IS NOT NULL
       AND p_source_context#>>'{client,id}' IS DISTINCT FROM v_connected_client_id THEN
        RAISE EXCEPTION 'client_identity_mismatch';
    END IF;
    IF p_source_context IS NOT NULL
       AND p_source_context->>'contractVersion' IS DISTINCT FROM 'source-context-v2' THEN
        RAISE EXCEPTION 'invalid_source_context_version';
    END IF;

    SELECT dictionary_id INTO v_dictionary_id
      FROM public.word_entries
     WHERE id = p_entry_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'entry_not_found';
    END IF;
    IF v_dictionary_id IS NOT NULL
       AND NOT public.can_access_dictionary(p_user_id, v_dictionary_id, 'read') THEN
        RAISE EXCEPTION 'entry_not_accessible';
    END IF;

    v_result := CASE p_action_id WHEN 'freeze-card' THEN 'freeze' ELSE 'hide' END;
    v_payload := jsonb_strip_nulls(jsonb_build_object(
        'contractVersion', 'platform-action-v2',
        'userId', p_user_id,
        'actionId', p_action_id,
        'entryId', p_entry_id,
        'cardTypeId', p_card_type_id,
        'stateRevision', p_state_revision,
        'clientEventId', p_client_event_id,
        'authKind', v_auth_kind,
        'connectedClientId', CASE
            WHEN v_auth_kind = 'connected_client' THEN v_connected_client_id
            ELSE NULL
        END
    ));
    v_payload_hash := encode(digest(v_payload::text, 'sha256'), 'hex');

    PERFORM pg_advisory_xact_lock(hashtext(p_user_id::text || ':' || p_client_event_id::text));
    SELECT * INTO v_existing
      FROM public.platform_v2_action_receipts
     WHERE user_id = p_user_id AND client_event_id = p_client_event_id;
    IF FOUND THEN
        IF v_existing.action_payload_hash <> v_payload_hash THEN
            RAISE EXCEPTION 'platform_action_idempotency_conflict';
        END IF;
        RETURN v_existing.response || jsonb_build_object('status', 'duplicate');
    END IF;

    PERFORM pg_advisory_xact_lock(hashtext(
        p_user_id::text || ':' || p_entry_id::text || ':' || p_card_type_id
    ));
    SELECT state_revision::text
      INTO v_state_revision
      FROM public.user_card_status
     WHERE user_id = p_user_id AND entry_id = p_entry_id AND card_type_id = p_card_type_id
     FOR UPDATE;

    IF NOT FOUND THEN
        IF p_state_revision <> 'untracked' THEN
            RAISE EXCEPTION 'platform_card_state_conflict';
        END IF;
        INSERT INTO public.user_card_status (
            user_id, entry_id, card_type_id, hidden, in_learning,
            fsrs_reps, fsrs_lapses, fsrs_enabled
        ) VALUES (p_user_id, p_entry_id, p_card_type_id, false, false, 0, 0, false)
        RETURNING state_revision::text INTO v_state_revision;
    ELSIF v_state_revision IS DISTINCT FROM p_state_revision THEN
        RAISE EXCEPTION 'platform_card_state_conflict';
    END IF;

    SELECT EXISTS (
        SELECT 1 FROM public.user_card_known_marks
         WHERE user_id = p_user_id AND entry_id = p_entry_id
           AND card_type_id = p_card_type_id AND cleared_at IS NULL
    ) INTO v_known;
    IF v_known THEN
        RAISE EXCEPTION 'card_is_known';
    END IF;

    INSERT INTO public.user_card_action_events (
        id, user_id, entry_id, card_type_id, action, result,
        client_event_id, action_payload_hash, source_context,
        auth_kind, connected_client_id, created_at
    ) VALUES (
        v_event_id, p_user_id, p_entry_id, p_card_type_id, p_action_id, NULL,
        p_client_event_id::text, v_payload_hash, p_source_context,
        v_auth_kind,
        CASE WHEN v_auth_kind = 'connected_client' THEN v_connected_client_id ELSE NULL END,
        now()
    );

    PERFORM public.handle_card_review(
        p_user_id, p_entry_id, p_card_type_id, v_result, NULL
    );

    v_response := jsonb_build_object(
        'status', 'accepted',
        'actionId', p_action_id,
        'clientEventId', p_client_event_id,
        'eventId', v_event_id,
        'card', private.platform_v2_card_state_json(p_user_id, p_entry_id, p_card_type_id)
    );
    v_request_projection := jsonb_build_object(
        'contractVersion', 'platform-action-report-verification-v1',
        'entryId', p_entry_id,
        'cardTypeId', p_card_type_id,
        'stateRevision', p_state_revision,
        'actionId', p_action_id,
        'clientEventId', p_client_event_id,
        'reviewResult', NULL,
        'activeKnownMarkId', NULL,
        'knownMarkRevision', NULL
    );
    INSERT INTO public.platform_v2_action_receipts (
        user_id, client_event_id, action_payload_hash, event_id, response,
        request_projection
    ) VALUES (
        p_user_id, p_client_event_id, v_payload_hash, v_event_id, v_response,
        v_request_projection
    );
    RETURN v_response;
END;
$$;

CREATE OR REPLACE FUNCTION public.perform_platform_v2_details_action_as_principal(
    p_user_id uuid,
    p_action_id text,
    p_entry_id uuid,
    p_card_type_id text,
    p_state_revision text,
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
        (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb)->>'role'
    );
BEGIN
    IF v_jwt_role IS DISTINCT FROM 'service_role' THEN
        RAISE EXCEPTION 'unauthorized';
    END IF;
    IF p_user_id IS NULL THEN
        RAISE EXCEPTION 'missing_user_id';
    END IF;
    PERFORM set_config('request.jwt.claim.sub', p_user_id::text, true);
    RETURN public.perform_platform_v2_details_action(
        p_user_id, p_action_id, p_entry_id, p_card_type_id, p_state_revision,
        p_client_event_id, p_source_context, p_auth_kind, p_connected_client_id
    );
END;
$$;

-- Keep the immutable receipt verifier in sync with the expanded action union.
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
        (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb)->>'role'
    );
BEGIN
    IF v_jwt_role IS DISTINCT FROM 'service_role' THEN
        RAISE EXCEPTION 'unauthorized';
    END IF;
    IF p_user_id IS NULL THEN
        RAISE EXCEPTION 'missing_user_id';
    END IF;
    IF jsonb_typeof(p_request_projection) IS DISTINCT FROM 'object'
       OR (SELECT count(*) FROM jsonb_object_keys(p_request_projection)) <> 9
       OR NOT p_request_projection ?& ARRAY[
           'contractVersion', 'entryId', 'cardTypeId', 'stateRevision',
           'actionId', 'clientEventId', 'reviewResult', 'activeKnownMarkId',
           'knownMarkRevision'
       ]
       OR p_request_projection->>'contractVersion'
          IS DISTINCT FROM 'platform-action-report-verification-v1' THEN
        RETURN false;
    END IF;
    v_action_id := p_request_projection->>'actionId';
    IF v_action_id NOT IN (
        'start-learning', 'mark-known', 'undo-known', 'review-card',
        'freeze-card', 'hide-card'
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
    EXCEPTION WHEN invalid_text_representation THEN
        RETURN false;
    END;
    PERFORM pg_advisory_xact_lock(
        hashtext(p_user_id::text || ':' || v_client_event_id::text)
    );
    RETURN EXISTS (
        SELECT 1 FROM public.platform_v2_action_receipts receipt
         WHERE receipt.user_id = p_user_id
           AND receipt.client_event_id = v_client_event_id
           AND receipt.request_projection = p_request_projection
    );
END;
$$;

REVOKE ALL ON FUNCTION public.verify_platform_v2_action_receipt_as_principal(
    uuid, jsonb
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_platform_v2_action_receipt_as_principal(
    uuid, jsonb
) TO service_role;

REVOKE ALL ON FUNCTION public.perform_platform_v2_details_action(
    uuid, text, uuid, text, text, uuid, jsonb, text, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.perform_platform_v2_details_action(
    uuid, text, uuid, text, text, uuid, jsonb, text, text
) TO service_role;

REVOKE ALL ON FUNCTION public.perform_platform_v2_details_action_as_principal(
    uuid, text, uuid, text, text, uuid, jsonb, text, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.perform_platform_v2_details_action_as_principal(
    uuid, text, uuid, text, text, uuid, jsonb, text, text
) TO service_role;

COMMIT;
