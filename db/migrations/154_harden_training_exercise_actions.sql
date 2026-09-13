-- Harden content-bound exercise retries and compose them with the one-active-run
-- boundary introduced by migration 153. Existing state/history is additive and
-- migration 153 remains immutable.

BEGIN;

-- An exercise action is identified by learner intent. Volatile observation,
-- diagnostics, and the optimistic state revision are transport/read details:
-- changing only those fields on a lost-response retry must not create a second
-- action or an idempotency conflict.
CREATE OR REPLACE FUNCTION private.platform_v2_training_exercise_action_payload_v1(
    p_user_id uuid,
    p_target_id uuid,
    p_review_result text,
    p_client_event_id uuid,
    p_training_session_id uuid,
    p_source_context jsonb
)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = public, private, extensions, pg_temp
AS $$
    SELECT jsonb_strip_nulls(jsonb_build_object(
        'contractVersion', 'platform-training-exercise-action-v1',
        'userId', p_user_id,
        'actionId', 'review-exercise',
        'targetId', p_target_id,
        'reviewResult', p_review_result,
        'clientEventId', p_client_event_id,
        'trainingSessionId', p_training_session_id,
        'sourceContext', NULLIF(
            jsonb_strip_nulls(jsonb_build_object(
                'contractVersion', p_source_context->>'contractVersion',
                'source', p_source_context->'source',
                'artifact', p_source_context->'artifact',
                'location', p_source_context->'location',
                'selection', p_source_context->'selection',
                'context', p_source_context->'context'
            )),
            '{}'::jsonb
        )
    ));
$$;

REVOKE ALL ON FUNCTION private.platform_v2_training_exercise_action_payload_v1(
    uuid, uuid, text, uuid, uuid, jsonb
) FROM PUBLIC, anon, authenticated, service_role;

-- Eligibility must apply to the target entry itself, not merely to an
-- accessible sibling that happens to share a headword group.
CREATE OR REPLACE FUNCTION private.platform_v2_training_ordinary_meaning_eligible_v1(
    p_user_id uuid,
    p_entry_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
    WITH target_entry AS (
        SELECT entry.id
          FROM public.word_entries AS entry
         WHERE entry.id = p_entry_id
           AND (
               entry.dictionary_id IS NULL
               OR public.can_access_dictionary(
                   p_user_id,
                   entry.dictionary_id,
                   'read'
               )
           )
    ),
    source_group AS (
        SELECT
            target_entry.id AS target_entry_id,
            private.platform_v2_training_entry_group_v1(target_entry.id) AS group_id
          FROM target_entry
    ),
    grouped_entries AS (
        SELECT entry.id
          FROM public.word_entries AS entry
          CROSS JOIN source_group
         WHERE (
                   (
                       source_group.group_id IS NULL
                       AND entry.id = source_group.target_entry_id
                   )
                OR (
                       source_group.group_id IS NOT NULL
                       AND private.platform_v2_training_entry_group_v1(entry.id)
                               IS NOT DISTINCT FROM source_group.group_id
                   )
               )
           AND (
               entry.dictionary_id IS NULL
               OR public.can_access_dictionary(
                   p_user_id,
                   entry.dictionary_id,
                   'read'
               )
           )
    )
    SELECT EXISTS (
        SELECT 1
          FROM grouped_entries AS grouped
         WHERE EXISTS (
                   SELECT 1
                     FROM public.user_card_status AS status
                    WHERE status.user_id = p_user_id
                      AND status.entry_id = grouped.id
                      AND status.card_type_id IN (
                          'word-to-definition',
                          'definition-to-word'
                      )
                      AND (
                          COALESCE(status.in_learning, false)
                          OR COALESCE(status.fsrs_enabled, false)
                          OR COALESCE(status.fsrs_reps, 0) > 0
                          OR status.last_reviewed_at IS NOT NULL
                      )
               )
            OR EXISTS (
                   SELECT 1
                     FROM public.user_card_known_marks AS known
                    WHERE known.user_id = p_user_id
                      AND known.entry_id = grouped.id
                      AND known.card_type_id IN (
                          'word-to-definition',
                          'definition-to-word'
                      )
                      AND known.cleared_at IS NULL
               )
    );
$$;

REVOKE ALL ON FUNCTION
    private.platform_v2_training_ordinary_meaning_eligible_v1(uuid, uuid)
    FROM PUBLIC, anon, authenticated, service_role;

-- A finite content-bound session advances only after the action, state, event,
-- and receipt have all succeeded in the same transaction.
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
    SELECT *
      INTO v_session
      FROM public.training_sessions AS session
     WHERE session.id = p_session_id
       AND session.user_id = p_user_id
     FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'training_exercise_session_member_missing';
    END IF;
    IF v_session.completed_at IS NOT NULL THEN
        RAISE EXCEPTION 'training_exercise_session_completed';
    END IF;

    SELECT *
      INTO v_member
      FROM public.training_session_exercise_members AS member
     WHERE member.session_id = p_session_id
       AND member.target_id = p_target_id
     FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'training_exercise_session_member_missing';
    END IF;
    IF v_member.consumed_at IS NOT NULL THEN
        RAISE EXCEPTION 'training_exercise_session_member_already_consumed';
    END IF;
    IF v_member.unavailable_at IS NOT NULL THEN
        RAISE EXCEPTION 'training_exercise_session_member_unavailable';
    END IF;

    SELECT *
      INTO v_expected
      FROM public.training_session_exercise_members AS member
     WHERE member.session_id = p_session_id
       AND member.consumed_at IS NULL
       AND member.unavailable_at IS NULL
     ORDER BY member.ordinal
     LIMIT 1;
    IF NOT FOUND
       OR v_expected.target_id IS DISTINCT FROM v_member.target_id THEN
        RAISE EXCEPTION 'training_exercise_session_member_out_of_order';
    END IF;

    UPDATE public.training_session_exercise_members
       SET consumed_at = v_now
     WHERE session_id = p_session_id
       AND target_id = p_target_id;

    SELECT count(*) FILTER (WHERE member.consumed_at IS NOT NULL)::integer,
           count(*) FILTER (
               WHERE member.consumed_at IS NULL
                 AND member.unavailable_at IS NULL
           )::integer
      INTO v_completed, v_remaining
      FROM public.training_session_exercise_members AS member
     WHERE member.session_id = p_session_id;

    IF v_completed >= v_session.requested_total OR v_remaining = 0 THEN
        UPDATE public.training_sessions
           SET completed_at = COALESCE(completed_at, v_now),
               exhausted_at = CASE
                   WHEN v_completed < v_session.requested_total
                       THEN COALESCE(exhausted_at, v_now)
                   ELSE exhausted_at
               END,
               completion_reason = CASE
                   WHEN v_completed >= v_session.requested_total THEN 'completed'
                   ELSE 'exhausted'
               END
         WHERE id = p_session_id;
    END IF;

    RETURN jsonb_build_object(
        'status', CASE
            WHEN v_completed >= v_session.requested_total OR v_remaining = 0
                THEN 'consumed-complete'
            ELSE 'consumed'
        END,
        'ordinal', v_member.ordinal,
        'remaining', v_remaining,
        'completedActions', v_completed,
        'requestedTotal', v_session.requested_total
    );
END;
$$;

REVOKE ALL ON FUNCTION private.consume_platform_v2_training_exercise_session_member_v1(
    uuid, uuid, uuid
) FROM PUBLIC, anon, authenticated, service_role;

-- Receipt lookup owns the first lock and happens before target visibility,
-- dictionary access, membership, or state checks. This makes an accepted
-- action replayable after consumption, access loss, source retirement, or run
-- takeover while rejecting a genuinely different action under the same ID.
CREATE OR REPLACE FUNCTION private.perform_platform_v2_idiom_exercise_action_v1(
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

    v_source_context := NULLIF(
        jsonb_strip_nulls(jsonb_build_object(
            'contractVersion', p_source_context->>'contractVersion',
            'source', p_source_context->'source',
            'artifact', p_source_context->'artifact',
            'location', p_source_context->'location',
            'selection', p_source_context->'selection',
            'context', p_source_context->'context'
        )),
        '{}'::jsonb
    );
    v_action_payload := private.platform_v2_training_exercise_action_payload_v1(
        p_user_id,
        p_target_id,
        p_review_result,
        p_client_event_id,
        p_training_session_id,
        v_source_context
    );
    v_action_payload_hash := encode(digest(v_action_payload::text, 'sha256'), 'hex');

    PERFORM pg_advisory_xact_lock(
        hashtext(p_user_id::text || ':exercise:' || p_client_event_id::text)
    );

    SELECT *
      INTO v_receipt
      FROM public.platform_v2_training_exercise_action_receipts AS receipt
     WHERE receipt.user_id = p_user_id
       AND receipt.client_event_id = p_client_event_id
     FOR UPDATE;
    IF FOUND THEN
        SELECT *
          INTO v_existing_event
          FROM public.user_training_exercise_action_events AS event
         WHERE event.id = v_receipt.event_id;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'training_exercise_action_receipt_event_missing';
        END IF;
        v_existing_payload := private.platform_v2_training_exercise_action_payload_v1(
            v_existing_event.user_id,
            v_existing_event.target_id,
            v_existing_event.result,
            v_existing_event.client_event_id,
            v_existing_event.session_id,
            v_existing_event.source_context
        );
        IF v_existing_payload IS DISTINCT FROM v_action_payload THEN
            RAISE EXCEPTION 'training_exercise_action_idempotency_conflict';
        END IF;
        RETURN v_receipt.response || jsonb_build_object('status', 'duplicate');
    END IF;

    SELECT *
      INTO v_existing_event
      FROM public.user_training_exercise_action_events AS event
     WHERE event.user_id = p_user_id
       AND event.client_event_id = p_client_event_id;
    IF FOUND THEN
        RAISE EXCEPTION 'training_exercise_action_idempotency_conflict';
    END IF;

    IF p_training_session_id IS NOT NULL THEN
        PERFORM private.require_active_training_session_v1(
            p_user_id,
            p_training_session_id
        );
    END IF;

    SELECT *
      INTO v_target
      FROM private.platform_v2_training_exercise_targets
     WHERE id = p_target_id
       AND family = 'idiom';
    IF NOT FOUND THEN
        RAISE EXCEPTION 'training_exercise_target_not_found';
    END IF;

    SELECT *
      INTO v_node
      FROM private.platform_v2_content_nodes
     WHERE id = v_target.content_node_id
       AND entry_id = v_target.entry_id
       AND kind = 'idiom'
       AND binding_state = 'active'
       AND source_text_fingerprint = v_target.source_text_fingerprint;
    IF NOT FOUND OR v_target.visibility_state <> 'active' THEN
        RAISE EXCEPTION 'training_exercise_target_unavailable';
    END IF;
    IF NOT private.platform_v2_training_ordinary_meaning_eligible_v1(
        p_user_id,
        v_target.entry_id
    ) THEN
        RAISE EXCEPTION 'training_exercise_source_not_eligible';
    END IF;

    PERFORM pg_advisory_xact_lock(
        hashtext(p_user_id::text || ':exercise-target:' || p_target_id::text)
    );

    SELECT *
      INTO v_state
      FROM public.user_training_exercise_state AS state
     WHERE state.user_id = p_user_id
       AND state.target_id = p_target_id
     FOR UPDATE;

    SELECT COALESCE(settings.target_retention, 0.9)
      INTO v_target_retention
      FROM public.user_settings AS settings
     WHERE settings.user_id = p_user_id;
    v_target_retention := COALESCE(v_target_retention, 0.9);

    IF v_state.target_id IS NULL THEN
        IF p_state_revision <> 'untracked' THEN
            RAISE EXCEPTION 'training_exercise_state_conflict';
        END IF;
        INSERT INTO public.user_training_exercise_state (
            user_id,
            target_id,
            fsrs_target_retention,
            next_review_at
        ) VALUES (
            p_user_id,
            p_target_id,
            v_target_retention,
            v_now
        ) RETURNING * INTO v_state;
    ELSIF v_state.state_revision::text IS DISTINCT FROM p_state_revision THEN
        RAISE EXCEPTION 'training_exercise_state_conflict';
    END IF;

    v_grade := CASE p_review_result
        WHEN 'fail' THEN 1
        WHEN 'hard' THEN 2
        WHEN 'success' THEN 3
        WHEN 'easy' THEN 4
    END;
    v_params := fsrs6_parameters();
    v_compute := fsrs6_compute(
        v_state.fsrs_stability,
        v_state.fsrs_difficulty,
        v_state.last_reviewed_at,
        v_grade,
        COALESCE(v_state.fsrs_target_retention, v_target_retention),
        v_state.fsrs_reps,
        v_state.fsrs_lapses,
        v_params
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
           success_count = COALESCE(v_state.success_count, 0)
               + CASE WHEN v_grade >= 3 THEN 1 ELSE 0 END,
           last_result = p_review_result,
           in_learning = false,
           learning_due_at = NULL
     WHERE user_id = p_user_id
       AND target_id = p_target_id;

    INSERT INTO public.user_training_exercise_action_events (
        id,
        user_id,
        target_id,
        session_id,
        action,
        result,
        client_event_id,
        action_payload_hash,
        source_context,
        created_at
    ) VALUES (
        v_event_id,
        p_user_id,
        p_target_id,
        p_training_session_id,
        'review-exercise',
        p_review_result,
        p_client_event_id,
        v_action_payload_hash,
        v_source_context,
        v_now
    );

    v_response := jsonb_build_object(
        'status', 'accepted',
        'actionId', 'review-exercise',
        'clientEventId', p_client_event_id,
        'eventId', v_event_id,
        'targetId', p_target_id,
        'targetKey', v_target.target_key,
        'family', 'idiom',
        'direction', v_target.direction,
        'state', private.platform_v2_training_exercise_state_json_v1(
            p_user_id,
            p_target_id
        )
    );

    INSERT INTO public.platform_v2_training_exercise_action_receipts (
        user_id,
        client_event_id,
        target_id,
        action_payload_hash,
        event_id,
        response,
        created_at
    ) VALUES (
        p_user_id,
        p_client_event_id,
        p_target_id,
        v_action_payload_hash,
        v_event_id,
        v_response,
        v_now
    );

    IF p_training_session_id IS NOT NULL THEN
        PERFORM private.consume_platform_v2_training_exercise_session_member_v1(
            p_user_id,
            p_training_session_id,
            p_target_id
        );
    END IF;

    RETURN v_response;
END;
$$;

REVOKE ALL ON FUNCTION private.perform_platform_v2_idiom_exercise_action_v1(
    uuid, uuid, text, text, uuid, uuid, jsonb
) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.perform_platform_v2_idiom_exercise_action_as_principal_v1(
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
    IF p_user_id IS NULL THEN RAISE EXCEPTION 'missing_user_id'; END IF;
    PERFORM set_config('request.jwt.claim.sub', p_user_id::text, true);

    RETURN private.perform_platform_v2_idiom_exercise_action_v1(
        p_user_id,
        p_target_id,
        p_state_revision,
        p_review_result,
        p_client_event_id,
        p_training_session_id,
        p_source_context
    );
END;
$$;

REVOKE ALL ON FUNCTION public.perform_platform_v2_idiom_exercise_action_as_principal_v1(
    uuid, uuid, text, text, uuid, uuid, jsonb
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.perform_platform_v2_idiom_exercise_action_as_principal_v1(
    uuid, uuid, text, text, uuid, uuid, jsonb
) TO service_role;

-- Candidate reads are immediate-work inventories. Future, not-due practice is
-- never allowed to consume a finite session slot.
CREATE OR REPLACE FUNCTION public.read_platform_v2_idiom_exercise_candidates_as_principal_v1(
    p_user_id uuid,
    p_direction text,
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
    IF v_jwt_role IS DISTINCT FROM 'service_role' THEN
        RAISE EXCEPTION 'unauthorized';
    END IF;
    IF p_user_id IS NULL THEN RAISE EXCEPTION 'missing_user_id'; END IF;

    RETURN jsonb_build_object(
        'family', 'idiom',
        'direction', p_direction,
        'items', COALESCE(
            (
                SELECT jsonb_agg(item)
                  FROM private.platform_v2_idiom_exercise_candidates_v1(
                      p_user_id,
                      p_direction,
                      p_limit,
                      p_offset
                  ) AS item
                 WHERE item->>'queueSource' IN ('new', 'learning', 'review')
            ),
            '[]'::jsonb
        )
    );
END;
$$;

REVOKE ALL ON FUNCTION public.read_platform_v2_idiom_exercise_candidates_as_principal_v1(
    uuid, text, integer, integer
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.read_platform_v2_idiom_exercise_candidates_as_principal_v1(
    uuid, text, integer, integer
) TO service_role;

-- Training reads fail closed after dictionary access or source-pool eligibility
-- is lost. Return the same generic shape as an unknown target so private target
-- metadata cannot be used as an access oracle.
CREATE OR REPLACE FUNCTION public.read_platform_v2_training_exercise_target_v1(
    p_user_id uuid,
    p_target_key text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, private, extensions, pg_temp
AS $$
DECLARE
    v_jwt_role text := COALESCE(
        NULLIF(current_setting('request.jwt.claim.role', true), ''),
        (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb)->>'role'
    );
    v_result jsonb;
BEGIN
    IF v_jwt_role IS DISTINCT FROM 'service_role' THEN
        RAISE EXCEPTION 'unauthorized';
    END IF;
    IF p_user_id IS NULL OR NULLIF(btrim(p_target_key), '') IS NULL THEN
        RETURN jsonb_build_object('error', 'training_exercise_target_not_found');
    END IF;

    SELECT jsonb_build_object(
        'targetKey', target.target_key,
        'entryId', target.entry_id,
        'contentNodeId', target.content_node_id,
        'family', target.family,
        'direction', target.direction,
        'sourceRevision', target.source_revision,
        'sourceTextFingerprint', target.source_text_fingerprint,
        'visibilityState', target.visibility_state,
        'sourceNodeState', node.binding_state,
        'state', CASE WHEN state.target_id IS NULL THEN NULL ELSE jsonb_build_object(
            'stateRevision', state.state_revision,
            'fsrsStability', state.fsrs_stability,
            'fsrsDifficulty', state.fsrs_difficulty,
            'fsrsReps', state.fsrs_reps,
            'fsrsLapses', state.fsrs_lapses,
            'fsrsLastGrade', state.fsrs_last_grade,
            'fsrsLastInterval', state.fsrs_last_interval,
            'fsrsTargetRetention', state.fsrs_target_retention,
            'fsrsParamsVersion', state.fsrs_params_version,
            'fsrsEnabled', state.fsrs_enabled,
            'nextReviewAt', state.next_review_at,
            'lastSeenAt', state.last_seen_at,
            'lastReviewedAt', state.last_reviewed_at,
            'seenCount', state.seen_count,
            'successCount', state.success_count,
            'lastResult', state.last_result,
            'hidden', state.hidden,
            'frozenUntil', state.frozen_until,
            'inLearning', state.in_learning,
            'learningDueAt', state.learning_due_at
        ) END
    )
      INTO v_result
      FROM private.platform_v2_training_exercise_targets AS target
      JOIN public.word_entries AS entry
        ON entry.id = target.entry_id
      LEFT JOIN private.platform_v2_content_nodes AS node
        ON node.id = target.content_node_id
      LEFT JOIN public.user_training_exercise_state AS state
        ON state.user_id = p_user_id
       AND state.target_id = target.id
     WHERE target.target_key = p_target_key
       AND (
           entry.dictionary_id IS NULL
           OR public.can_access_dictionary(p_user_id, entry.dictionary_id, 'read')
       )
       AND target.visibility_state = 'active'
       AND (
           target.family = 'meaning'
           OR (
               node.binding_state = 'active'
               AND node.entry_id = target.entry_id
               AND node.source_text_fingerprint = target.source_text_fingerprint
           )
       )
       AND (
           target.family = 'meaning'
           OR private.platform_v2_training_ordinary_meaning_eligible_v1(
               p_user_id,
               target.entry_id
           )
       );

    RETURN COALESCE(v_result, jsonb_build_object(
        'error', 'training_exercise_target_not_found'
    ));
END;
$$;

REVOKE ALL ON FUNCTION public.read_platform_v2_training_exercise_target_v1(uuid, text)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.read_platform_v2_training_exercise_target_v1(uuid, text)
    TO service_role;

COMMIT;
