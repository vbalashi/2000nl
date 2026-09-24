-- Add the sentence-translation exercise consumer. The source sentence is a
-- content-node identity; the selected translation language is presentation
-- data and therefore does not create another FSRS target.

BEGIN;

CREATE OR REPLACE FUNCTION private.platform_v2_translation_exercise_candidates_v1(
    p_user_id uuid,
    p_limit integer DEFAULT 20,
    p_offset integer DEFAULT 0
)
RETURNS SETOF jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, private, extensions, pg_temp
AS $$
DECLARE
    v_candidate record;
    v_target_id uuid;
    v_target_key text;
    v_count integer := 0;
    v_error text;
    v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 20), 1), 1000);
    v_offset integer := GREATEST(COALESCE(p_offset, 0), 0);
BEGIN
    IF p_user_id IS NULL THEN RAISE EXCEPTION 'missing_user_id'; END IF;

    FOR v_candidate IN
        WITH source_nodes AS (
            SELECT
                node.id AS content_node_id,
                node.entry_id,
                node.diagnostic_locator AS source_path,
                node.source_text_fingerprint,
                node.created_at,
                encode(digest(
                    node.id::text || ':' || node.source_text_fingerprint,
                    'sha256'
                ), 'hex') AS source_revision
              FROM private.platform_v2_content_nodes AS node
             WHERE node.kind = 'example'
               AND node.binding_state = 'active'
               AND NULLIF(btrim(node.diagnostic_locator), '') IS NOT NULL
               AND node.diagnostic_locator ~ '^raw\.meanings\[[0-9]+\]\.examples\[[0-9]+\]$'
               AND private.platform_v2_training_ordinary_meaning_eligible_v1(
                   p_user_id, node.entry_id
               )
               AND NOT EXISTS (
                   SELECT 1
                     FROM private.platform_v2_training_exercise_targets AS stale
                    WHERE stale.entry_id = node.entry_id
                      AND stale.content_node_id = node.id
                      AND stale.family = 'translation'
                      AND stale.direction = 'recall'
                      AND stale.source_text_fingerprint
                            IS DISTINCT FROM node.source_text_fingerprint
               )
        ),
        shaped AS (
            SELECT
                source_nodes.*,
                target.id AS target_id,
                state.fsrs_enabled,
                state.next_review_at,
                state.fsrs_last_interval,
                state.hidden,
                state.frozen_until,
                CASE
                    WHEN state.target_id IS NULL
                      OR COALESCE(state.fsrs_enabled, false) = false THEN 0
                    WHEN state.next_review_at <= private.training_reference_now_v1()
                         AND COALESCE(state.fsrs_last_interval, 0) < 1 THEN 1
                    WHEN state.next_review_at <= private.training_reference_now_v1()
                        THEN 2
                    ELSE 3
                END AS queue_rank
              FROM source_nodes
              LEFT JOIN private.platform_v2_training_exercise_targets AS target
                ON target.entry_id = source_nodes.entry_id
               AND target.content_node_id = source_nodes.content_node_id
               AND target.family = 'translation'
               AND target.direction = 'recall'
              LEFT JOIN public.user_training_exercise_state AS state
                ON state.user_id = p_user_id
               AND state.target_id = target.id
        )
        SELECT *
         FROM shaped
         WHERE COALESCE(hidden, false) = false
           AND (frozen_until IS NULL OR frozen_until <= private.training_reference_now_v1())
           AND queue_rank < 3
         ORDER BY queue_rank, next_review_at NULLS FIRST, created_at, content_node_id
         OFFSET v_offset
         LIMIT v_limit
    LOOP
        BEGIN
            v_target_id := private.ensure_platform_v2_training_exercise_target_v1(
                v_candidate.entry_id,
                v_candidate.content_node_id,
                'translation',
                'recall',
                v_candidate.source_revision,
                v_candidate.source_text_fingerprint
            );
        EXCEPTION WHEN raise_exception THEN
            v_error := SQLERRM;
            IF v_error IN (
                'training_exercise_target_rebind_requires_new_node',
                'training_exercise_target_source_not_active'
            ) THEN CONTINUE; END IF;
            RAISE;
        END;

        SELECT target_key INTO v_target_key
          FROM private.platform_v2_training_exercise_targets
         WHERE id = v_target_id;

        RETURN NEXT jsonb_build_object(
            'targetId', v_target_id,
            'targetKey', v_target_key,
            'family', 'translation',
            'direction', 'recall',
            'entryId', v_candidate.entry_id,
            'contentNodeId', v_candidate.content_node_id,
            'sourcePath', v_candidate.source_path,
            'sourceRevision', v_candidate.source_revision,
            'sourceTextFingerprint', v_candidate.source_text_fingerprint,
            'queueSource', CASE
                WHEN v_candidate.target_id IS NULL THEN 'new'
                WHEN COALESCE(v_candidate.fsrs_enabled, false) = false THEN 'new'
                WHEN v_candidate.next_review_at <= private.training_reference_now_v1()
                     AND COALESCE(v_candidate.fsrs_last_interval, 0) < 1 THEN 'learning'
                WHEN v_candidate.next_review_at <= private.training_reference_now_v1()
                    THEN 'review'
                ELSE 'practice'
            END,
            'state', private.platform_v2_training_exercise_state_json_v1(
                p_user_id, v_target_id
            )
        );
        v_count := v_count + 1;
        EXIT WHEN v_count >= v_limit;
    END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION private.platform_v2_translation_exercise_candidates_v1(uuid, integer, integer)
    FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.read_platform_v2_translation_candidates_as_principal_v1(
    p_user_id uuid,
    p_limit integer DEFAULT 20,
    p_offset integer DEFAULT 0
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
    IF v_jwt_role IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'unauthorized'; END IF;
    IF p_user_id IS NULL THEN RAISE EXCEPTION 'missing_user_id'; END IF;
    RETURN jsonb_build_object(
        'contractVersion', 'platform-translation-exercise-candidates-v1',
        'family', 'translation',
        'direction', 'recall',
        'items', COALESCE((
            SELECT jsonb_agg(item)
              FROM private.platform_v2_translation_exercise_candidates_v1(
                  p_user_id, p_limit, p_offset
              ) AS candidates(item)
        ), '[]'::jsonb)
    );
END;
$$;

ALTER FUNCTION public.read_platform_v2_translation_candidates_as_principal_v1(uuid, integer, integer)
    OWNER TO postgres;
REVOKE ALL ON FUNCTION public.read_platform_v2_translation_candidates_as_principal_v1(uuid, integer, integer)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.read_platform_v2_translation_candidates_as_principal_v1(uuid, integer, integer)
    TO service_role;

-- The shared consumer now fences both non-ordinary session families.
CREATE OR REPLACE FUNCTION private.consume_platform_v2_training_exercise_session_member_v1(
    p_user_id uuid,
    p_session_id uuid,
    p_target_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, extensions, pg_temp
AS $$
DECLARE
    v_session public.training_sessions%rowtype;
    v_member public.training_session_exercise_members%rowtype;
    v_expected public.training_session_exercise_members%rowtype;
    v_completed integer;
    v_remaining integer;
    v_now timestamptz := private.training_reference_now_v1();
BEGIN
    SELECT * INTO v_session
      FROM public.training_sessions
     WHERE id = p_session_id AND user_id = p_user_id
     FOR UPDATE;
    IF NOT FOUND OR v_session.exercise_family NOT IN ('idiom', 'translation') THEN
        RAISE EXCEPTION 'training_exercise_session_family_mismatch';
    END IF;
    IF v_session.completed_at IS NOT NULL THEN
        RAISE EXCEPTION 'training_exercise_session_completed';
    END IF;

    SELECT * INTO v_member
      FROM public.training_session_exercise_members
     WHERE session_id = p_session_id AND target_id = p_target_id
     FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'training_exercise_session_member_missing'; END IF;
    IF v_member.consumed_at IS NOT NULL THEN RAISE EXCEPTION 'training_exercise_session_member_already_consumed'; END IF;
    IF v_member.unavailable_at IS NOT NULL THEN RAISE EXCEPTION 'training_exercise_session_member_unavailable'; END IF;

    SELECT * INTO v_expected
      FROM public.training_session_exercise_members
     WHERE session_id = p_session_id
       AND consumed_at IS NULL
       AND unavailable_at IS NULL
     ORDER BY ordinal LIMIT 1;
    IF NOT FOUND OR v_expected.target_id IS DISTINCT FROM v_member.target_id THEN
        RAISE EXCEPTION 'training_exercise_session_member_out_of_order';
    END IF;

    UPDATE public.training_session_exercise_members
       SET consumed_at = v_now
     WHERE session_id = p_session_id AND target_id = p_target_id;
    SELECT count(*) FILTER (WHERE consumed_at IS NOT NULL)::integer,
           count(*) FILTER (WHERE consumed_at IS NULL AND unavailable_at IS NULL)::integer
      INTO v_completed, v_remaining
      FROM public.training_session_exercise_members
     WHERE session_id = p_session_id;

    IF v_completed >= v_session.requested_total OR v_remaining = 0 THEN
        UPDATE public.training_sessions
           SET completed_at = COALESCE(completed_at, v_now),
               exhausted_at = CASE WHEN v_completed < v_session.requested_total
                   THEN COALESCE(exhausted_at, v_now) ELSE exhausted_at END,
               completion_reason = CASE WHEN v_completed >= v_session.requested_total
                   THEN 'completed' ELSE 'exhausted' END
         WHERE id = p_session_id;
    END IF;
    RETURN jsonb_build_object(
        'status', CASE WHEN v_completed >= v_session.requested_total OR v_remaining = 0
            THEN 'consumed-complete' ELSE 'consumed' END,
        'ordinal', v_member.ordinal,
        'remaining', v_remaining,
        'completedActions', v_completed,
        'requestedTotal', v_session.requested_total
    );
END;
$$;

REVOKE ALL ON FUNCTION private.consume_platform_v2_training_exercise_session_member_v1(uuid, uuid, uuid)
    FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION private.training_translation_session_response_v1(
    p_user_id uuid,
    p_session_id uuid
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, private, extensions, pg_temp
AS $$
    SELECT private.training_session_run_response_v1(p_user_id, session.id)
        || jsonb_build_object(
            'contractVersion', 'platform-translation-exercise-session-v1',
            'exerciseFamily', 'translation',
            'direction', 'recall',
            'completedActions', COALESCE(completed.actions, 0),
            'completionReason', session.completion_reason,
            'members', COALESCE(members.items, '[]'::jsonb)
        )
      FROM public.training_sessions AS session
      LEFT JOIN LATERAL (
          SELECT count(*)::integer AS actions
            FROM public.training_session_exercise_members AS member
           WHERE member.session_id = session.id AND member.consumed_at IS NOT NULL
      ) AS completed ON true
      LEFT JOIN LATERAL (
          SELECT jsonb_agg(jsonb_build_object(
              'ordinal', member.ordinal,
              'targetId', member.target_id,
              'queueSource', member.queue_source,
              'consumedAt', member.consumed_at,
              'unavailableAt', member.unavailable_at,
              'unavailableReason', member.unavailable_reason,
              'entryId', target.entry_id,
              'contentNodeId', target.content_node_id,
              'family', target.family,
              'direction', target.direction
          ) ORDER BY member.ordinal) AS items
            FROM public.training_session_exercise_members AS member
            JOIN private.platform_v2_training_exercise_targets AS target
              ON target.id = member.target_id
            JOIN public.word_entries AS entry ON entry.id = target.entry_id
           WHERE member.session_id = session.id
             AND target.family = 'translation'
             AND (entry.dictionary_id IS NULL OR public.can_access_dictionary(p_user_id, entry.dictionary_id, 'read'))
             AND private.platform_v2_training_ordinary_meaning_eligible_v1(p_user_id, target.entry_id)
      ) AS members ON true
     WHERE session.id = p_session_id
       AND session.user_id = p_user_id
       AND session.exercise_family = 'translation';
$$;

REVOKE ALL ON FUNCTION private.training_translation_session_response_v1(uuid, uuid)
    FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION private.start_platform_v2_translation_training_session_v1(
    p_user_id uuid,
    p_session_size text,
    p_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, extensions, pg_temp
AS $$
DECLARE
    v_session_id uuid := gen_random_uuid();
    v_size text := COALESCE(NULLIF(btrim(p_session_size), ''), '10');
    v_requested_total integer;
    v_request_hash text;
    v_receipt public.training_exercise_run_start_receipts%rowtype;
    v_candidate jsonb;
    v_candidates jsonb[] := ARRAY[]::jsonb[];
    v_new_candidates jsonb[] := ARRAY[]::jsonb[];
    v_review_candidates jsonb[] := ARRAY[]::jsonb[];
    v_new_index integer := 1;
    v_review_index integer := 1;
    v_reviews_since_new integer := 0;
    v_ratio integer := 2;
    v_target_id uuid;
    v_queue_source text;
    v_ordinal integer := 0;
    v_planned_new integer;
    v_planned_review integer;
    v_planned_total integer;
    v_now timestamptz := private.training_reference_now_v1();
BEGIN
    IF (select auth.uid()) IS NULL OR p_user_id IS DISTINCT FROM (select auth.uid()) THEN
        RAISE EXCEPTION 'unauthorized: user_id does not match authenticated user';
    END IF;
    IF p_request_id IS NULL THEN RAISE EXCEPTION 'missing_translation_training_session_request_id'; END IF;
    IF v_size !~ '^[1-9][0-9]*$' OR length(v_size) > 9 THEN
        RAISE EXCEPTION 'invalid translation training session size: %', v_size;
    END IF;
    v_requested_total := v_size::integer;
    v_request_hash := encode(digest(jsonb_build_object(
        'exerciseFamily', 'translation',
        'direction', 'recall',
        'sessionSize', v_size
    )::text, 'sha256'), 'hex');

    PERFORM pg_advisory_xact_lock(hashtext('training-active-run:' || p_user_id::text));
    SELECT * INTO v_receipt
      FROM public.training_exercise_run_start_receipts AS receipt
     WHERE receipt.user_id = p_user_id AND receipt.request_id = p_request_id
     FOR UPDATE;
    IF FOUND THEN
        IF v_receipt.request_hash IS DISTINCT FROM v_request_hash THEN
            RAISE EXCEPTION 'translation_training_session_start_idempotency_conflict';
        END IF;
        RETURN private.training_translation_session_response_v1(p_user_id, v_receipt.session_id);
    END IF;

    INSERT INTO public.training_sessions (
        id, user_id, exercise_family, session_size, card_type_ids,
        list_type, card_filter, training_filter, requested_total, created_at
    ) VALUES (
        v_session_id, p_user_id, 'translation', v_size, ARRAY['translation:recall'],
        'curated', 'both', '{}'::jsonb, v_requested_total, v_now
    );

    -- Request more than the final size so the soft new/review preference can
    -- still be applied without treating either category as a quota.
    FOR v_candidate IN
        SELECT candidate.item
          FROM private.platform_v2_translation_exercise_candidates_v1(
              p_user_id, LEAST(1000, GREATEST(100, v_requested_total * 8)), 0
          ) AS candidate(item)
    LOOP
        EXIT WHEN v_candidate->>'queueSource' = 'practice';
        IF v_candidate->>'queueSource' = 'new' THEN
            v_new_candidates := array_append(v_new_candidates, v_candidate);
        ELSIF v_candidate->>'queueSource' IN ('learning', 'review') THEN
            v_review_candidates := array_append(v_review_candidates, v_candidate);
        END IF;
    END LOOP;

    SELECT LEAST(5, GREATEST(1, COALESCE(settings.new_review_ratio, 2)))::integer
      INTO v_ratio
      FROM public.user_settings AS settings
     WHERE settings.user_id = p_user_id;
    v_ratio := COALESCE(v_ratio, 2);

    WHILE v_ordinal < v_requested_total
      AND (v_new_index <= COALESCE(array_length(v_new_candidates, 1), 0)
           OR v_review_index <= COALESCE(array_length(v_review_candidates, 1), 0))
    LOOP
        IF v_ordinal = 0
           AND v_new_index <= COALESCE(array_length(v_new_candidates, 1), 0) THEN
            v_candidate := v_new_candidates[v_new_index];
            v_new_index := v_new_index + 1;
            v_reviews_since_new := 0;
        ELSIF v_review_index <= COALESCE(array_length(v_review_candidates, 1), 0)
              AND (v_new_index > COALESCE(array_length(v_new_candidates, 1), 0)
                   OR v_reviews_since_new < v_ratio) THEN
            v_candidate := v_review_candidates[v_review_index];
            v_review_index := v_review_index + 1;
            v_reviews_since_new := v_reviews_since_new + 1;
        ELSIF v_new_index <= COALESCE(array_length(v_new_candidates, 1), 0) THEN
            v_candidate := v_new_candidates[v_new_index];
            v_new_index := v_new_index + 1;
            v_reviews_since_new := 0;
        ELSE
            v_candidate := v_review_candidates[v_review_index];
            v_review_index := v_review_index + 1;
            v_reviews_since_new := v_reviews_since_new + 1;
        END IF;

        v_target_id := NULLIF(v_candidate->>'targetId', '')::uuid;
        v_queue_source := NULLIF(v_candidate->>'queueSource', '');
        IF v_target_id IS NULL OR v_queue_source NOT IN ('new', 'learning', 'review') THEN
            RAISE EXCEPTION 'invalid_translation_session_candidate';
        END IF;
        v_ordinal := v_ordinal + 1;
        INSERT INTO public.training_session_exercise_members(session_id, target_id, ordinal, queue_source)
        VALUES (v_session_id, v_target_id, v_ordinal, v_queue_source);
    END LOOP;

    SELECT count(*) FILTER (WHERE queue_source = 'new')::integer,
           count(*) FILTER (WHERE queue_source IN ('learning', 'review'))::integer,
           count(*)::integer
      INTO v_planned_new, v_planned_review, v_planned_total
      FROM public.training_session_exercise_members
     WHERE session_id = v_session_id;
    UPDATE public.training_sessions
       SET planned_new = COALESCE(v_planned_new, 0),
           planned_review = COALESCE(v_planned_review, 0),
           planned_practice = 0,
           planned_total = COALESCE(v_planned_total, 0),
           completed_at = CASE WHEN COALESCE(v_planned_total, 0) = 0 THEN v_now END,
           exhausted_at = CASE WHEN COALESCE(v_planned_total, 0) = 0 THEN v_now END,
           completion_reason = CASE WHEN COALESCE(v_planned_total, 0) = 0 THEN 'exhausted' END
     WHERE id = v_session_id;

    INSERT INTO public.training_exercise_run_start_receipts(
        user_id, request_id, exercise_family, direction, session_size,
        request_hash, session_id, created_at
    ) VALUES (
        p_user_id, p_request_id, 'translation', 'recall', v_size,
        v_request_hash, v_session_id, v_now
    );
    RETURN private.training_translation_session_response_v1(p_user_id, v_session_id);
END;
$$;

REVOKE ALL ON FUNCTION private.start_platform_v2_translation_training_session_v1(uuid, text, uuid)
    FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.start_platform_v2_translation_training_session(
    p_user_id uuid,
    p_session_size text,
    p_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, extensions, pg_temp
AS $$
BEGIN
    RETURN private.start_platform_v2_translation_training_session_v1(
        p_user_id, p_session_size, p_request_id
    );
END;
$$;

ALTER FUNCTION public.start_platform_v2_translation_training_session(uuid, text, uuid)
    OWNER TO postgres;
REVOKE ALL ON FUNCTION public.start_platform_v2_translation_training_session(uuid, text, uuid)
    FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.start_platform_v2_translation_training_session(uuid, text, uuid)
    TO authenticated;

CREATE OR REPLACE FUNCTION private.perform_platform_v2_translation_exercise_action_v1(
    p_user_id uuid,
    p_target_id uuid,
    p_state_revision text,
    p_review_result text,
    p_client_event_id uuid,
    p_training_session_id uuid DEFAULT NULL,
    p_source_context jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, private, extensions, pg_temp
AS $$
DECLARE
    v_target private.platform_v2_training_exercise_targets%rowtype;
    v_node private.platform_v2_content_nodes%rowtype;
    v_state public.user_training_exercise_state%rowtype;
    v_receipt public.platform_v2_training_exercise_action_receipts%rowtype;
    v_existing_event public.user_training_exercise_action_events%rowtype;
    v_source_context jsonb;
    v_action_payload jsonb;
    v_existing_payload jsonb;
    v_action_payload_hash text;
    v_event_id uuid := gen_random_uuid();
    v_grade smallint;
    v_params numeric[];
    v_target_retention numeric;
    v_compute jsonb;
    v_interval numeric;
    v_now timestamptz := private.training_reference_now_v1();
    v_response jsonb;
BEGIN
    IF p_user_id IS NULL THEN RAISE EXCEPTION 'missing_user_id'; END IF;
    IF p_target_id IS NULL THEN RAISE EXCEPTION 'missing_target_id'; END IF;
    IF p_state_revision IS NULL THEN RAISE EXCEPTION 'missing_state_revision'; END IF;
    IF p_review_result NOT IN ('fail', 'hard', 'success', 'easy') THEN
        RAISE EXCEPTION 'invalid_review_result';
    END IF;
    IF p_client_event_id IS NULL THEN RAISE EXCEPTION 'missing_client_event_id'; END IF;

    v_source_context := NULLIF(jsonb_strip_nulls(jsonb_build_object(
        'contractVersion', p_source_context->>'contractVersion',
        'source', p_source_context->'source',
        'artifact', p_source_context->'artifact',
        'location', p_source_context->'location',
        'selection', p_source_context->'selection',
        'context', p_source_context->'context'
    )), '{}'::jsonb);
    v_action_payload := private.platform_v2_training_exercise_action_payload_v1(
        p_user_id, p_target_id, p_review_result, p_client_event_id,
        p_training_session_id, v_source_context
    );
    v_action_payload_hash := encode(digest(v_action_payload::text, 'sha256'), 'hex');

    PERFORM pg_advisory_xact_lock(hashtext(p_user_id::text || ':exercise:' || p_client_event_id::text));
    SELECT * INTO v_receipt
      FROM public.platform_v2_training_exercise_action_receipts AS receipt
     WHERE receipt.user_id = p_user_id AND receipt.client_event_id = p_client_event_id
     FOR UPDATE;
    IF FOUND THEN
        SELECT * INTO v_existing_event
          FROM public.user_training_exercise_action_events AS event
         WHERE event.id = v_receipt.event_id;
        IF NOT FOUND THEN RAISE EXCEPTION 'training_exercise_action_receipt_event_missing'; END IF;
        v_existing_payload := private.platform_v2_training_exercise_action_payload_v1(
            v_existing_event.user_id, v_existing_event.target_id, v_existing_event.result,
            v_existing_event.client_event_id, v_existing_event.session_id,
            v_existing_event.source_context
        );
        IF v_existing_payload IS DISTINCT FROM v_action_payload THEN
            RAISE EXCEPTION 'training_exercise_action_idempotency_conflict';
        END IF;
        RETURN v_receipt.response || jsonb_build_object('status', 'duplicate');
    END IF;

    SELECT * INTO v_existing_event
      FROM public.user_training_exercise_action_events AS event
     WHERE event.user_id = p_user_id AND event.client_event_id = p_client_event_id;
    IF FOUND THEN RAISE EXCEPTION 'training_exercise_action_idempotency_conflict'; END IF;
    IF p_training_session_id IS NOT NULL THEN
        PERFORM private.require_active_training_session_v1(p_user_id, p_training_session_id);
    END IF;

    SELECT * INTO v_target
      FROM private.platform_v2_training_exercise_targets
     WHERE id = p_target_id AND family = 'translation' AND direction = 'recall';
    IF NOT FOUND THEN RAISE EXCEPTION 'training_exercise_target_not_found'; END IF;
    SELECT * INTO v_node
      FROM private.platform_v2_content_nodes
     WHERE id = v_target.content_node_id
       AND entry_id = v_target.entry_id
       AND kind = 'example'
       AND binding_state = 'active'
       AND source_text_fingerprint = v_target.source_text_fingerprint;
    IF NOT FOUND OR v_target.visibility_state <> 'active' THEN
        RAISE EXCEPTION 'training_exercise_target_unavailable';
    END IF;
    IF NOT private.platform_v2_training_ordinary_meaning_eligible_v1(p_user_id, v_target.entry_id) THEN
        RAISE EXCEPTION 'training_exercise_source_not_eligible';
    END IF;

    PERFORM pg_advisory_xact_lock(hashtext(p_user_id::text || ':exercise-target:' || p_target_id::text));
    SELECT * INTO v_state
      FROM public.user_training_exercise_state AS state
     WHERE state.user_id = p_user_id AND state.target_id = p_target_id
     FOR UPDATE;
    SELECT COALESCE(settings.target_retention, 0.9) INTO v_target_retention
      FROM public.user_settings AS settings WHERE settings.user_id = p_user_id;
    v_target_retention := COALESCE(v_target_retention, 0.9);
    IF v_state.target_id IS NULL THEN
        IF p_state_revision <> 'untracked' THEN RAISE EXCEPTION 'training_exercise_state_conflict'; END IF;
        INSERT INTO public.user_training_exercise_state(user_id, target_id, fsrs_target_retention, next_review_at)
        VALUES (p_user_id, p_target_id, v_target_retention, v_now)
        RETURNING * INTO v_state;
    ELSIF v_state.state_revision::text IS DISTINCT FROM p_state_revision THEN
        RAISE EXCEPTION 'training_exercise_state_conflict';
    END IF;

    v_grade := CASE p_review_result WHEN 'fail' THEN 1 WHEN 'hard' THEN 2 WHEN 'success' THEN 3 WHEN 'easy' THEN 4 END;
    v_params := fsrs6_parameters();
    v_compute := fsrs6_compute(
        v_state.fsrs_stability, v_state.fsrs_difficulty, v_state.last_reviewed_at,
        v_grade, COALESCE(v_state.fsrs_target_retention, v_target_retention),
        v_state.fsrs_reps, v_state.fsrs_lapses, v_params
    );
    v_interval := (v_compute->>'interval')::numeric;
    UPDATE public.user_training_exercise_state
       SET fsrs_stability = (v_compute->>'stability')::numeric,
           fsrs_difficulty = (v_compute->>'difficulty')::numeric,
           fsrs_reps = (v_compute->>'reps')::integer,
           fsrs_lapses = (v_compute->>'lapses')::integer,
           fsrs_last_grade = v_grade,
           fsrs_last_interval = v_interval,
           fsrs_target_retention = COALESCE(v_state.fsrs_target_retention, v_target_retention),
           fsrs_params_version = 'fsrs-6-default',
           fsrs_enabled = true,
           next_review_at = v_now + (v_interval || ' days')::interval,
           last_seen_at = v_now,
           last_reviewed_at = v_now,
           seen_count = COALESCE(v_state.seen_count, 0) + 1,
           success_count = COALESCE(v_state.success_count, 0) + CASE WHEN v_grade >= 3 THEN 1 ELSE 0 END,
           last_result = p_review_result,
           in_learning = false,
           learning_due_at = NULL
     WHERE user_id = p_user_id AND target_id = p_target_id;

    INSERT INTO public.user_training_exercise_action_events(
        id, user_id, target_id, session_id, action, result, client_event_id,
        action_payload_hash, source_context, created_at
    ) VALUES (
        v_event_id, p_user_id, p_target_id, p_training_session_id, 'review-exercise',
        p_review_result, p_client_event_id, v_action_payload_hash, v_source_context, v_now
    );
    v_response := jsonb_build_object(
        'status', 'accepted', 'actionId', 'review-exercise',
        'clientEventId', p_client_event_id, 'eventId', v_event_id,
        'targetId', p_target_id, 'targetKey', v_target.target_key,
        'family', 'translation', 'direction', 'recall',
        'state', private.platform_v2_training_exercise_state_json_v1(p_user_id, p_target_id)
    );
    INSERT INTO public.platform_v2_training_exercise_action_receipts(
        user_id, client_event_id, target_id, action_payload_hash,
        event_id, response, created_at
    ) VALUES (
        p_user_id, p_client_event_id, p_target_id, v_action_payload_hash,
        v_event_id, v_response, v_now
    );
    IF p_training_session_id IS NOT NULL THEN
        PERFORM private.consume_platform_v2_training_exercise_session_member_v1(
            p_user_id, p_training_session_id, p_target_id
        );
    END IF;
    RETURN v_response;
END;
$$;

REVOKE ALL ON FUNCTION private.perform_platform_v2_translation_exercise_action_v1(uuid, uuid, text, text, uuid, uuid, jsonb)
    FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.perform_platform_v2_translation_exercise_action_as_principal_v1(
    p_user_id uuid,
    p_target_id uuid,
    p_state_revision text,
    p_review_result text,
    p_client_event_id uuid,
    p_direction text,
    p_training_session_id uuid DEFAULT NULL,
    p_source_context jsonb DEFAULT NULL
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
    IF v_jwt_role IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'unauthorized'; END IF;
    IF p_user_id IS NULL THEN RAISE EXCEPTION 'missing_user_id'; END IF;
    IF p_direction IS DISTINCT FROM 'recall' THEN RAISE EXCEPTION 'invalid_translation_exercise_direction'; END IF;
    IF NOT EXISTS (
        SELECT 1 FROM private.platform_v2_training_exercise_targets
         WHERE id = p_target_id AND family = 'translation' AND direction = 'recall'
    ) THEN RAISE EXCEPTION 'training_exercise_target_direction_mismatch'; END IF;
    PERFORM set_config('request.jwt.claim.sub', p_user_id::text, true);
    RETURN private.perform_platform_v2_translation_exercise_action_v1(
        p_user_id, p_target_id, p_state_revision, p_review_result,
        p_client_event_id, p_training_session_id, p_source_context
    );
END;
$$;

ALTER FUNCTION public.perform_platform_v2_translation_exercise_action_as_principal_v1(
    uuid, uuid, text, text, uuid, text, uuid, jsonb
) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.perform_platform_v2_translation_exercise_action_as_principal_v1(
    uuid, uuid, text, text, uuid, text, uuid, jsonb
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.perform_platform_v2_translation_exercise_action_as_principal_v1(
    uuid, uuid, text, text, uuid, text, uuid, jsonb
) TO service_role;

CREATE OR REPLACE FUNCTION public.read_platform_v2_translation_training_session_snapshot(
    p_user_id uuid,
    p_session_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, private, extensions, pg_temp
AS $$
DECLARE
    v_session public.training_sessions%rowtype;
BEGIN
    IF (select auth.uid()) IS NULL OR p_user_id IS DISTINCT FROM (select auth.uid()) THEN
        RAISE EXCEPTION 'unauthorized: user_id does not match authenticated user';
    END IF;
    SELECT * INTO v_session
      FROM public.training_sessions
     WHERE id = p_session_id AND user_id = p_user_id AND exercise_family = 'translation';
    IF NOT FOUND THEN RETURN NULL; END IF;
    RETURN private.training_translation_session_response_v1(p_user_id, p_session_id);
END;
$$;

ALTER FUNCTION public.read_platform_v2_translation_training_session_snapshot(uuid, uuid)
    OWNER TO postgres;
REVOKE ALL ON FUNCTION public.read_platform_v2_translation_training_session_snapshot(uuid, uuid)
    FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.read_platform_v2_translation_training_session_snapshot(uuid, uuid)
    TO authenticated;

CREATE OR REPLACE FUNCTION public.read_platform_v2_translation_training_session_next(
    p_user_id uuid,
    p_session_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, private, extensions, pg_temp
AS $$
DECLARE
    v_session public.training_sessions%rowtype;
    v_member public.training_session_exercise_members%rowtype;
    v_payload jsonb;
    v_remaining integer;
BEGIN
    IF (select auth.uid()) IS NULL OR p_user_id IS DISTINCT FROM (select auth.uid()) THEN
        RAISE EXCEPTION 'unauthorized: user_id does not match authenticated user';
    END IF;
    SELECT * INTO v_session
      FROM public.training_sessions
     WHERE id = p_session_id AND user_id = p_user_id AND exercise_family = 'translation';
    IF NOT FOUND THEN RETURN jsonb_build_object('status', 'not-member'); END IF;
    IF NOT EXISTS (
        SELECT 1 FROM public.training_active_runs
         WHERE user_id = p_user_id AND session_id = p_session_id
    ) THEN
        RETURN jsonb_build_object('status', 'superseded', 'sessionId', p_session_id);
    END IF;

    SELECT member.* INTO v_member
      FROM public.training_session_exercise_members AS member
     WHERE member.session_id = p_session_id
       AND member.consumed_at IS NULL AND member.unavailable_at IS NULL
     ORDER BY member.ordinal LIMIT 1;
    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'status', CASE WHEN v_session.completed_at IS NOT NULL
                THEN COALESCE(v_session.completion_reason, 'completed') ELSE 'exhausted' END,
            'sessionId', p_session_id,
            'completedActions', COALESCE((
                SELECT count(*)::integer FROM public.training_session_exercise_members
                 WHERE session_id = p_session_id AND consumed_at IS NOT NULL
            ), 0),
            'requestedTotal', v_session.requested_total
        );
    END IF;
    IF NOT EXISTS (
        SELECT 1
          FROM private.platform_v2_training_exercise_targets AS target
          JOIN public.word_entries AS entry ON entry.id = target.entry_id
         WHERE target.id = v_member.target_id
           AND target.family = 'translation' AND target.direction = 'recall'
           AND (entry.dictionary_id IS NULL OR public.can_access_dictionary(p_user_id, entry.dictionary_id, 'read'))
           AND private.platform_v2_training_ordinary_meaning_eligible_v1(p_user_id, target.entry_id)
    ) THEN
        SELECT count(*)::integer INTO v_remaining
          FROM public.training_session_exercise_members
         WHERE session_id = p_session_id AND consumed_at IS NULL AND unavailable_at IS NULL;
        RETURN jsonb_build_object(
            'status', 'unavailable', 'sessionId', p_session_id,
            'ordinal', v_member.ordinal, 'targetId', v_member.target_id,
            'reason', 'dictionary-access-revoked', 'remaining', v_remaining
        );
    END IF;

    SELECT jsonb_build_object(
        'targetId', target.id,
        'targetKey', target.target_key,
        'entryId', target.entry_id,
        'contentNodeId', target.content_node_id,
        'family', 'translation',
        'direction', 'recall',
        'sourceRevision', target.source_revision,
        'sourceTextFingerprint', target.source_text_fingerprint,
        'sourcePath', node.diagnostic_locator,
        'state', private.platform_v2_training_exercise_state_json_v1(p_user_id, target.id)
    ) INTO v_payload
      FROM private.platform_v2_training_exercise_targets AS target
      JOIN private.platform_v2_content_nodes AS node
        ON node.id = target.content_node_id
       AND node.entry_id = target.entry_id
       AND node.kind = 'example'
       AND node.binding_state = 'active'
       AND node.source_text_fingerprint = target.source_text_fingerprint
     WHERE target.id = v_member.target_id
       AND target.family = 'translation'
       AND target.direction = 'recall'
       AND target.visibility_state = 'active';
    IF v_payload IS NULL THEN
        SELECT count(*)::integer INTO v_remaining
          FROM public.training_session_exercise_members
         WHERE session_id = p_session_id AND consumed_at IS NULL AND unavailable_at IS NULL;
        RETURN jsonb_build_object(
            'status', 'unavailable', 'sessionId', p_session_id,
            'ordinal', v_member.ordinal, 'targetId', v_member.target_id,
            'reason', 'projection-missing', 'remaining', v_remaining
        );
    END IF;
    RETURN v_payload || jsonb_build_object(
        'status', 'ready', 'sessionId', p_session_id,
        'ordinal', v_member.ordinal, 'queueSource', v_member.queue_source
    );
END;
$$;

ALTER FUNCTION public.read_platform_v2_translation_training_session_next(uuid, uuid)
    OWNER TO postgres;
REVOKE ALL ON FUNCTION public.read_platform_v2_translation_training_session_next(uuid, uuid)
    FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.read_platform_v2_translation_training_session_next(uuid, uuid)
    TO authenticated;

CREATE OR REPLACE FUNCTION public.mark_platform_v2_translation_session_member_unavailable(
    p_user_id uuid,
    p_session_id uuid,
    p_target_id uuid,
    p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, extensions, pg_temp
AS $$
DECLARE
    v_session public.training_sessions%rowtype;
    v_member public.training_session_exercise_members%rowtype;
    v_expected public.training_session_exercise_members%rowtype;
    v_remaining integer;
    v_completed integer;
    v_now timestamptz := private.training_reference_now_v1();
BEGIN
    IF (select auth.uid()) IS NULL OR p_user_id IS DISTINCT FROM (select auth.uid()) THEN
        RAISE EXCEPTION 'unauthorized: user_id does not match authenticated user';
    END IF;
    IF p_reason NOT IN ('projection-missing', 'dictionary-access-revoked', 'entry-not-found') THEN
        RAISE EXCEPTION 'invalid_translation_session_unavailable_reason';
    END IF;
    PERFORM private.require_active_training_session_v1(p_user_id, p_session_id);
    SELECT * INTO v_session
      FROM public.training_sessions
     WHERE id = p_session_id AND user_id = p_user_id AND exercise_family = 'translation'
     FOR UPDATE;
    IF NOT FOUND THEN RETURN jsonb_build_object('status', 'not-member'); END IF;
    SELECT * INTO v_member FROM public.training_session_exercise_members
     WHERE session_id = p_session_id AND target_id = p_target_id FOR UPDATE;
    IF NOT FOUND THEN RETURN jsonb_build_object('status', 'not-member'); END IF;
    IF v_member.consumed_at IS NOT NULL THEN
        RETURN jsonb_build_object('status', 'consumed', 'ordinal', v_member.ordinal);
    END IF;
    IF v_member.unavailable_at IS NOT NULL THEN
        RETURN jsonb_build_object('status', 'unavailable', 'ordinal', v_member.ordinal,
            'reason', v_member.unavailable_reason);
    END IF;
    SELECT * INTO v_expected FROM public.training_session_exercise_members
     WHERE session_id = p_session_id AND consumed_at IS NULL AND unavailable_at IS NULL
     ORDER BY ordinal LIMIT 1;
    IF v_expected.target_id IS DISTINCT FROM p_target_id THEN
        RETURN jsonb_build_object('status', 'out-of-order', 'ordinal', v_member.ordinal,
            'expectedOrdinal', v_expected.ordinal);
    END IF;
    UPDATE public.training_session_exercise_members
       SET unavailable_at = v_now, unavailable_reason = p_reason
     WHERE session_id = p_session_id AND target_id = p_target_id;
    SELECT count(*) FILTER (WHERE consumed_at IS NULL AND unavailable_at IS NULL)::integer,
           count(*) FILTER (WHERE consumed_at IS NOT NULL)::integer
      INTO v_remaining, v_completed
      FROM public.training_session_exercise_members WHERE session_id = p_session_id;
    IF v_remaining = 0 THEN
        UPDATE public.training_sessions
           SET completed_at = COALESCE(completed_at, v_now),
               exhausted_at = COALESCE(exhausted_at, v_now),
               completion_reason = COALESCE(completion_reason, 'exhausted')
         WHERE id = p_session_id;
    END IF;
    RETURN jsonb_build_object(
        'status', CASE WHEN v_remaining = 0 THEN 'unavailable-exhausted' ELSE 'unavailable' END,
        'ordinal', v_member.ordinal, 'reason', p_reason,
        'remaining', v_remaining, 'completedActions', v_completed
    );
END;
$$;

ALTER FUNCTION public.mark_platform_v2_translation_session_member_unavailable(uuid, uuid, uuid, text)
    OWNER TO postgres;
REVOKE ALL ON FUNCTION public.mark_platform_v2_translation_session_member_unavailable(uuid, uuid, uuid, text)
    FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.mark_platform_v2_translation_session_member_unavailable(uuid, uuid, uuid, text)
    TO authenticated;

CREATE OR REPLACE FUNCTION public.reconcile_platform_v2_translation_receipt_as_principal(
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
        (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb)->>'role'
    );
    v_receipt public.platform_v2_training_exercise_action_receipts%rowtype;
    v_event public.user_training_exercise_action_events%rowtype;
BEGIN
    IF v_jwt_role IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'unauthorized'; END IF;
    IF p_user_id IS NULL OR p_client_event_id IS NULL THEN
        RAISE EXCEPTION 'missing_training_exercise_receipt_identity';
    END IF;
    PERFORM pg_advisory_xact_lock(hashtext(p_user_id::text || ':exercise:' || p_client_event_id::text));
    SELECT * INTO v_receipt
      FROM public.platform_v2_training_exercise_action_receipts AS receipt
     WHERE receipt.user_id = p_user_id AND receipt.client_event_id = p_client_event_id;
    IF NOT FOUND THEN RETURN NULL; END IF;
    SELECT * INTO v_event
      FROM public.user_training_exercise_action_events AS event
     WHERE event.id = v_receipt.event_id
       AND event.user_id = p_user_id
       AND event.action = 'review-exercise'
       AND EXISTS (
           SELECT 1 FROM private.platform_v2_training_exercise_targets AS target
            WHERE target.id = event.target_id
              AND target.family = 'translation'
              AND target.direction = 'recall'
       );
    IF NOT FOUND THEN RAISE EXCEPTION 'training_exercise_action_receipt_event_missing'; END IF;
    RETURN v_receipt.response || jsonb_build_object('status', 'duplicate');
END;
$$;

ALTER FUNCTION public.reconcile_platform_v2_translation_receipt_as_principal(uuid, uuid)
    OWNER TO postgres;
REVOKE ALL ON FUNCTION public.reconcile_platform_v2_translation_receipt_as_principal(uuid, uuid)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_platform_v2_translation_receipt_as_principal(uuid, uuid)
    TO service_role;

COMMIT;
