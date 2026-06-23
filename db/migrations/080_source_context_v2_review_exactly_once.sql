-- Prevent source-context-v2 provenance events from being accepted when their
-- review turn id was already consumed outside the same provenance event.

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
    v_source_id uuid;
    v_location_id uuid;
    v_artifact jsonb;
    v_artifact_id uuid;
    v_artifact_identity_key text;
    v_auth_kind text;
    v_connected_client_id text;
    v_existing_event_id uuid;
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

    IF p_source_context->>'contractVersion' = 'source-context-v2'
       AND p_action IN ('review-card', 'mark-known', 'mark-unknown') THEN
        IF p_client_event_id IS NULL
           OR p_client_event_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
            RAISE EXCEPTION 'v2_client_event_id_must_be_uuid';
        END IF;

        IF p_turn_id IS NULL OR p_turn_id IS DISTINCT FROM p_client_event_id::uuid THEN
            RAISE EXCEPTION 'v2_turn_id_mismatch';
        END IF;

        SELECT id INTO v_existing_event_id
        FROM user_card_action_events
        WHERE user_id = p_user_id
          AND client_event_id = p_client_event_id;

        IF v_existing_event_id IS NULL AND EXISTS (
            SELECT 1
            FROM user_review_log
            WHERE turn_id = p_client_event_id::uuid
        ) THEN
            RAISE EXCEPTION 'platform_review_turn_already_consumed';
        END IF;
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
        v_source_id := NULLIF(v_result->>'sourceId', '')::uuid;
        v_location_id := NULLIF(v_result->>'locationId', '')::uuid;

        IF p_source_context->>'contractVersion' = 'source-context-v2'
           AND jsonb_typeof(p_source_context->'artifact') = 'object'
           AND v_source_id IS NOT NULL THEN
            v_artifact := p_source_context->'artifact';
            v_artifact_identity_key := encode(digest(jsonb_build_object(
                'sourceId', v_source_id,
                'artifact', v_artifact
            )::text, 'sha256'), 'hex');

            INSERT INTO learning_source_artifacts (
                source_id,
                artifact_identity_key,
                artifact_kind,
                producer,
                snapshot_revision_id,
                text_source_id,
                text_source_revision_id,
                text_content_fingerprint,
                timing_evidence_revision_id,
                phrase_set_revision_id,
                builder_version,
                language_code,
                quality,
                metadata,
                first_seen_at,
                last_seen_at
            )
            VALUES (
                v_source_id,
                v_artifact_identity_key,
                left(v_artifact->>'artifactKind', 80),
                left(v_artifact->>'producer', 80),
                NULLIF(left(COALESCE(v_artifact->>'snapshotRevisionId', ''), 160), ''),
                NULLIF(left(COALESCE(v_artifact->>'textSourceId', ''), 160), ''),
                NULLIF(left(COALESCE(v_artifact->>'textSourceRevisionId', ''), 160), ''),
                NULLIF(left(COALESCE(v_artifact->>'textContentFingerprint', ''), 160), ''),
                NULLIF(left(COALESCE(v_artifact->>'timingEvidenceRevisionId', ''), 160), ''),
                NULLIF(left(COALESCE(v_artifact->>'phraseSetRevisionId', ''), 160), ''),
                NULLIF(left(COALESCE(v_artifact->>'builderVersion', ''), 80), ''),
                NULLIF(left(COALESCE(v_artifact->>'languageCode', ''), 16), ''),
                NULLIF(left(COALESCE(v_artifact->>'quality', ''), 80), ''),
                '{}'::jsonb,
                now(),
                now()
            )
            ON CONFLICT (source_id, artifact_identity_key) DO UPDATE
            SET last_seen_at = now(),
                quality = COALESCE(excluded.quality, learning_source_artifacts.quality)
            RETURNING id INTO v_artifact_id;

            IF v_location_id IS NOT NULL THEN
                UPDATE learning_source_locations
                SET artifact_id = v_artifact_id
                WHERE id = v_location_id;
            END IF;
        END IF;

        UPDATE user_card_action_events
        SET auth_kind = v_auth_kind,
            connected_client_id = v_connected_client_id,
            artifact_id = v_artifact_id
        WHERE id = v_event_id
          AND user_id = p_user_id;
    END IF;

    RETURN v_result || jsonb_build_object(
        'authKind', v_auth_kind,
        'connectedClientId', v_connected_client_id,
        'artifactId', v_artifact_id
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
