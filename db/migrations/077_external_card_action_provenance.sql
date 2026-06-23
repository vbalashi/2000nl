-- Source/provenance-aware external card actions.
--
-- The platform action HTTP route can use perform_platform_card_action for
-- card-state mutations that need client idempotency and source-linked history.
-- The function keeps the idempotency check, card mutation, and event insert in
-- one database transaction.

CREATE TABLE IF NOT EXISTS learning_sources (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    source_identity_key text NOT NULL UNIQUE,
    kind text NOT NULL,
    provider text,
    external_id text,
    canonical_url text,
    title text,
    language_code text,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    first_seen_at timestamptz NOT NULL DEFAULT now(),
    last_seen_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS learning_sources_kind_provider_idx
    ON learning_sources(kind, provider);

CREATE INDEX IF NOT EXISTS learning_sources_external_id_idx
    ON learning_sources(provider, external_id)
    WHERE external_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS learning_source_locations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    source_id uuid NOT NULL REFERENCES learning_sources(id) ON DELETE CASCADE,
    locator_key text NOT NULL,
    locator_kind text NOT NULL,
    start_ms integer,
    end_ms integer,
    phrase_index integer,
    text_hash text,
    context_text text,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    first_seen_at timestamptz NOT NULL DEFAULT now(),
    last_seen_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (source_id, locator_key)
);

CREATE INDEX IF NOT EXISTS learning_source_locations_source_idx
    ON learning_source_locations(source_id, locator_kind);

CREATE TABLE IF NOT EXISTS user_card_action_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    entry_id uuid NOT NULL REFERENCES word_entries(id) ON DELETE CASCADE,
    card_type_id text NOT NULL,
    action text NOT NULL,
    result text,
    client_event_id text,
    turn_id uuid,
    source_id uuid REFERENCES learning_sources(id) ON DELETE SET NULL,
    location_id uuid REFERENCES learning_source_locations(id) ON DELETE SET NULL,
    clicked_form text,
    context_text_hash text,
    action_payload_hash text NOT NULL,
    source_context jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS user_card_action_events_client_event_uniq
    ON user_card_action_events(user_id, client_event_id)
    WHERE client_event_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS user_card_action_events_user_date_idx
    ON user_card_action_events(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS user_card_action_events_user_source_date_idx
    ON user_card_action_events(user_id, source_id, created_at DESC)
    WHERE source_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS user_card_action_events_entry_idx
    ON user_card_action_events(user_id, entry_id, card_type_id, created_at DESC);

ALTER TABLE learning_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE learning_source_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_card_action_events ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'user_card_action_events'
          AND policyname = 'user_card_action_events_select_self'
    ) THEN
        CREATE POLICY user_card_action_events_select_self
            ON user_card_action_events
            FOR SELECT TO authenticated
            USING (user_id = (select auth.uid()));
    END IF;
END $$;

CREATE OR REPLACE FUNCTION private.safe_jsonb_int(p_value text)
RETURNS integer
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
    IF p_value IS NULL OR p_value !~ '^-?[0-9]+$' THEN
        RETURN NULL;
    END IF;
    RETURN p_value::integer;
EXCEPTION WHEN others THEN
    RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.perform_platform_card_action(
    p_user_id uuid,
    p_entry_id uuid,
    p_card_type_id text,
    p_action text,
    p_result text DEFAULT NULL,
    p_turn_id uuid DEFAULT NULL,
    p_client_event_id text DEFAULT NULL,
    p_source_context jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE
    v_dictionary_id uuid;
    v_existing user_card_action_events%rowtype;
    v_source jsonb;
    v_location jsonb;
    v_context jsonb;
    v_source_id uuid;
    v_location_id uuid;
    v_kind text;
    v_provider text;
    v_external_id text;
    v_url text;
    v_title text;
    v_language_code text;
    v_source_identity_key text;
    v_locator_kind text;
    v_start_ms integer;
    v_end_ms integer;
    v_phrase_index integer;
    v_context_text text;
    v_context_text_hash text;
    v_clicked_form text;
    v_locator_key text;
    v_effective_result text;
    v_effective_turn_id uuid;
    v_action_payload jsonb;
    v_action_payload_hash text;
    v_event_id uuid;
BEGIN
    IF (select auth.uid()) IS NULL OR p_user_id IS DISTINCT FROM (select auth.uid()) THEN
        RAISE EXCEPTION 'unauthorized: user_id does not match authenticated user';
    END IF;

    IF p_action NOT IN ('record-view', 'start-learning', 'mark-known', 'mark-unknown', 'review-card') THEN
        RAISE EXCEPTION 'unsupported_action';
    END IF;

    IF p_client_event_id IS NOT NULL AND length(trim(p_client_event_id)) = 0 THEN
        RAISE EXCEPTION 'invalid_client_event_id';
    END IF;

    SELECT dictionary_id INTO v_dictionary_id
    FROM word_entries
    WHERE id = p_entry_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'word entry not found';
    END IF;

    IF v_dictionary_id IS NOT NULL
       AND NOT can_access_dictionary(p_user_id, v_dictionary_id, 'read') THEN
        RAISE EXCEPTION 'dictionary access denied';
    END IF;

    v_effective_result := CASE p_action
        WHEN 'mark-known' THEN 'easy'
        WHEN 'mark-unknown' THEN 'fail'
        ELSE p_result
    END;

    IF p_action = 'review-card'
       AND v_effective_result NOT IN ('fail', 'hard', 'success', 'easy', 'freeze', 'hide') THEN
        RAISE EXCEPTION 'missing_or_invalid_result';
    END IF;

    IF p_action IN ('mark-known', 'mark-unknown', 'review-card') THEN
        v_effective_turn_id := COALESCE(p_turn_id, CASE
            WHEN p_client_event_id IS NOT NULL
             AND p_client_event_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
            THEN p_client_event_id::uuid
            ELSE NULL
        END);
    ELSE
        v_effective_turn_id := p_turn_id;
    END IF;

    v_action_payload := jsonb_strip_nulls(jsonb_build_object(
        'entryId', p_entry_id,
        'cardTypeId', p_card_type_id,
        'action', p_action,
        'result', v_effective_result,
        'turnId', v_effective_turn_id,
        'sourceContext', p_source_context
    ));
    v_action_payload_hash := md5(v_action_payload::text);

    IF p_client_event_id IS NOT NULL THEN
        PERFORM pg_advisory_xact_lock(hashtext(p_user_id::text || ':' || p_client_event_id));

        SELECT * INTO v_existing
        FROM user_card_action_events
        WHERE user_id = p_user_id
          AND client_event_id = p_client_event_id;

        IF FOUND THEN
            IF v_existing.action_payload_hash <> v_action_payload_hash THEN
                RAISE EXCEPTION 'platform_action_idempotency_conflict';
            END IF;

            RETURN jsonb_build_object(
                'status', 'duplicate',
                'eventId', v_existing.id,
                'sourceId', v_existing.source_id,
                'locationId', v_existing.location_id
            );
        END IF;
    END IF;

    v_source := CASE
        WHEN jsonb_typeof(p_source_context->'source') = 'object'
        THEN p_source_context->'source'
        ELSE NULL
    END;
    v_location := CASE
        WHEN jsonb_typeof(p_source_context->'location') = 'object'
        THEN p_source_context->'location'
        ELSE NULL
    END;
    v_context := CASE
        WHEN jsonb_typeof(p_source_context->'context') = 'object'
        THEN p_source_context->'context'
        ELSE NULL
    END;

    v_clicked_form := NULLIF(left(trim(COALESCE(v_context->>'clickedForm', '')), 160), '');
    v_context_text := NULLIF(left(COALESCE(v_context->>'text', ''), 1000), '');
    v_context_text_hash := CASE WHEN v_context_text IS NULL THEN NULL ELSE md5(v_context_text) END;

    IF v_source IS NOT NULL THEN
        v_kind := COALESCE(NULLIF(left(trim(v_source->>'kind'), 80), ''), 'unknown');
        v_provider := NULLIF(left(trim(v_source->>'provider'), 80), '');
        v_external_id := NULLIF(left(trim(COALESCE(v_source->>'externalId', v_source->>'external_id')), 240), '');
        v_url := NULLIF(left(trim(COALESCE(v_source->>'url', v_source->>'canonicalUrl', v_source->>'canonical_url')), 2048), '');
        v_title := NULLIF(left(trim(v_source->>'title'), 500), '');
        v_language_code := NULLIF(left(trim(COALESCE(v_source->>'languageCode', v_source->>'language_code')), 16), '');
        v_source_identity_key := md5(concat_ws('|', v_kind, COALESCE(v_provider, ''), COALESCE(v_external_id, ''), COALESCE(v_url, '')));

        INSERT INTO learning_sources (
            source_identity_key,
            kind,
            provider,
            external_id,
            canonical_url,
            title,
            language_code,
            metadata,
            first_seen_at,
            last_seen_at
        )
        VALUES (
            v_source_identity_key,
            v_kind,
            v_provider,
            v_external_id,
            v_url,
            v_title,
            v_language_code,
            jsonb_strip_nulls(jsonb_build_object(
                'contractVersion', p_source_context->>'contractVersion',
                'client', p_source_context->'client'
            )),
            now(),
            now()
        )
        ON CONFLICT (source_identity_key) DO UPDATE
        SET title = COALESCE(excluded.title, learning_sources.title),
            language_code = COALESCE(excluded.language_code, learning_sources.language_code),
            metadata = learning_sources.metadata || excluded.metadata,
            last_seen_at = now()
        RETURNING id INTO v_source_id;

        IF v_location IS NOT NULL OR v_context_text_hash IS NOT NULL THEN
            v_locator_kind := COALESCE(NULLIF(left(trim(v_location->>'kind'), 80), ''), 'context');
            v_start_ms := private.safe_jsonb_int(COALESCE(v_location->>'startMs', v_location->>'start_ms'));
            v_end_ms := private.safe_jsonb_int(COALESCE(v_location->>'endMs', v_location->>'end_ms'));
            v_phrase_index := private.safe_jsonb_int(COALESCE(v_location->>'phraseIndex', v_location->>'phrase_index'));
            v_locator_key := md5(jsonb_strip_nulls(jsonb_build_object(
                'kind', v_locator_kind,
                'startMs', v_start_ms,
                'endMs', v_end_ms,
                'phraseIndex', v_phrase_index,
                'contextTextHash', v_context_text_hash
            ))::text);

            INSERT INTO learning_source_locations (
                source_id,
                locator_key,
                locator_kind,
                start_ms,
                end_ms,
                phrase_index,
                text_hash,
                context_text,
                metadata,
                first_seen_at,
                last_seen_at
            )
            VALUES (
                v_source_id,
                v_locator_key,
                v_locator_kind,
                v_start_ms,
                v_end_ms,
                v_phrase_index,
                v_context_text_hash,
                v_context_text,
                jsonb_strip_nulls(jsonb_build_object(
                    'diagnostics', p_source_context->'diagnostics'
                )),
                now(),
                now()
            )
            ON CONFLICT (source_id, locator_key) DO UPDATE
            SET last_seen_at = now(),
                context_text = COALESCE(learning_source_locations.context_text, excluded.context_text),
                metadata = learning_source_locations.metadata || excluded.metadata
            RETURNING id INTO v_location_id;
        END IF;
    END IF;

    IF p_action = 'record-view' THEN
        PERFORM record_card_view(p_user_id, p_entry_id, p_card_type_id);
    ELSIF p_action = 'start-learning' THEN
        PERFORM start_learning_entry_card(p_user_id, p_entry_id, p_card_type_id);
    ELSE
        PERFORM handle_card_review(
            p_user_id,
            p_entry_id,
            p_card_type_id,
            v_effective_result,
            v_effective_turn_id
        );
    END IF;

    INSERT INTO user_card_action_events (
        user_id,
        entry_id,
        card_type_id,
        action,
        result,
        client_event_id,
        turn_id,
        source_id,
        location_id,
        clicked_form,
        context_text_hash,
        action_payload_hash,
        source_context,
        created_at
    )
    VALUES (
        p_user_id,
        p_entry_id,
        p_card_type_id,
        p_action,
        v_effective_result,
        p_client_event_id,
        v_effective_turn_id,
        v_source_id,
        v_location_id,
        v_clicked_form,
        v_context_text_hash,
        v_action_payload_hash,
        p_source_context,
        now()
    )
    RETURNING id INTO v_event_id;

    RETURN jsonb_build_object(
        'status', 'accepted',
        'eventId', v_event_id,
        'sourceId', v_source_id,
        'locationId', v_location_id
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
    jsonb
) TO authenticated;
