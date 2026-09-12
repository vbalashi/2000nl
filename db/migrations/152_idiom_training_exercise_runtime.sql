-- Idiom exercise selection and self-assessed FSRS actions.
--
-- Idioms are a separate exercise family.  They are eligible when the source
-- headword group contains at least one ordinary meaning that this learner has
-- enrolled or marked Known.  The idiom itself never receives an ordinary
-- Learn/Known action or ordinary card state.

BEGIN;

ALTER TABLE public.user_training_exercise_action_events
    DROP CONSTRAINT IF EXISTS user_training_exercise_action_events_action_check;

ALTER TABLE public.user_training_exercise_action_events
    ADD CONSTRAINT user_training_exercise_action_events_action_check
    CHECK (
        action IN (
            'record-view',
            'start-learning',
            'mark-known',
            'undo-known',
            'review-card',
            'review-exercise'
        )
    );

CREATE OR REPLACE FUNCTION private.platform_v2_training_entry_group_v1(
    p_entry_id uuid
)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
    SELECT COALESCE(source_group.id, user_group.id)
      FROM public.word_entries AS entry
      LEFT JOIN private.source_entry_bindings AS binding
        ON binding.word_entry_id = entry.id
       AND binding.binding_state = 'active'
      LEFT JOIN private.platform_v2_headword_groups AS source_group
        ON source_group.management_kind = 'source'
       AND source_group.dictionary_id = binding.dictionary_id
       AND source_group.identity_scheme_version = binding.identity_scheme_version
       AND source_group.source_group_key = binding.source_group_key
      LEFT JOIN private.platform_v2_headword_groups AS user_group
        ON user_group.management_kind = 'user'
       AND user_group.singleton_entry_id = entry.id
     WHERE entry.id = p_entry_id
     LIMIT 1;
$$;

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
    WITH source_group AS (
        SELECT private.platform_v2_training_entry_group_v1(p_entry_id) AS group_id
    ),
    grouped_entries AS (
        SELECT entry.id
          FROM public.word_entries AS entry
          CROSS JOIN source_group
         WHERE private.platform_v2_training_entry_group_v1(entry.id)
                   IS NOT DISTINCT FROM source_group.group_id
           AND source_group.group_id IS NOT NULL
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

REVOKE ALL ON FUNCTION private.platform_v2_training_entry_group_v1(uuid)
    FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION
    private.platform_v2_training_ordinary_meaning_eligible_v1(uuid, uuid)
    FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION private.platform_v2_training_exercise_state_json_v1(
    p_user_id uuid,
    p_target_id uuid
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
    SELECT CASE
        WHEN state.target_id IS NULL THEN NULL::jsonb
        ELSE jsonb_build_object(
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
        )
    END
      FROM (SELECT 1) AS seed
      LEFT JOIN public.user_training_exercise_state AS state
        ON state.user_id = p_user_id
       AND state.target_id = p_target_id;
$$;

REVOKE ALL ON FUNCTION
    private.platform_v2_training_exercise_state_json_v1(uuid, uuid)
    FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION private.platform_v2_idiom_exercise_candidates_v1(
    p_user_id uuid,
    p_direction text,
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
    v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 20), 1), 100);
    v_offset integer := GREATEST(COALESCE(p_offset, 0), 0);
BEGIN
    IF p_user_id IS NULL THEN
        RAISE EXCEPTION 'missing_user_id';
    END IF;
    IF p_direction NOT IN ('direct', 'reverse') THEN
        RAISE EXCEPTION 'invalid_idiom_exercise_direction';
    END IF;

    FOR v_candidate IN
        WITH source_nodes AS (
            SELECT
                node.id AS content_node_id,
                node.entry_id,
                node.diagnostic_locator AS expression_source_path,
                node.source_text_fingerprint,
                node.created_at,
                encode(
                    digest(
                        node.id::text || ':' || node.source_text_fingerprint,
                        'sha256'
                    ),
                    'hex'
                ) AS source_revision
              FROM private.platform_v2_content_nodes AS node
             WHERE node.kind = 'idiom'
               AND node.binding_state = 'active'
               AND private.platform_v2_training_ordinary_meaning_eligible_v1(
                   p_user_id,
                   node.entry_id
               )
               AND EXISTS (
                   SELECT 1
                     FROM private.platform_v2_content_nodes AS explanation
                    WHERE explanation.parent_content_node_id = node.id
                      AND explanation.kind = 'idiom-explanation'
                      AND explanation.binding_state = 'active'
                      AND NULLIF(btrim(explanation.diagnostic_locator), '') IS NOT NULL
               )
               AND NOT EXISTS (
                   SELECT 1
                     FROM private.platform_v2_training_exercise_targets AS stale
                    WHERE stale.entry_id = node.entry_id
                      AND stale.content_node_id = node.id
                      AND stale.family = 'idiom'
                      AND stale.direction = p_direction
                      AND stale.source_text_fingerprint
                            IS DISTINCT FROM node.source_text_fingerprint
               )
        ),
        shaped AS (
            SELECT
                source_nodes.*,
                explanation.diagnostic_locator AS explanation_source_path,
                COALESCE(examples.items, '[]'::jsonb) AS examples,
                target.id AS target_id,
                state.fsrs_enabled,
                state.next_review_at,
                state.fsrs_last_interval,
                state.hidden,
                state.frozen_until,
                CASE
                    WHEN state.target_id IS NULL
                      OR COALESCE(state.fsrs_enabled, false) = false
                        THEN 0
                    WHEN state.next_review_at <= private.training_reference_now_v1()
                         AND COALESCE(state.fsrs_last_interval, 0) < 1
                        THEN 1
                    WHEN state.next_review_at <= private.training_reference_now_v1()
                        THEN 2
                    ELSE 3
                END AS queue_rank
              FROM source_nodes
              JOIN LATERAL (
                  SELECT child.diagnostic_locator
                    FROM private.platform_v2_content_nodes AS child
                   WHERE child.parent_content_node_id = source_nodes.content_node_id
                     AND child.kind = 'idiom-explanation'
                     AND child.binding_state = 'active'
                     AND NULLIF(btrim(child.diagnostic_locator), '') IS NOT NULL
                   ORDER BY child.created_at, child.id
                   LIMIT 1
              ) AS explanation ON true
              LEFT JOIN LATERAL (
                  SELECT jsonb_agg(child.diagnostic_locator ORDER BY child.created_at, child.id) AS items
                    FROM private.platform_v2_content_nodes AS child
                   WHERE child.parent_content_node_id = source_nodes.content_node_id
                     AND child.kind = 'example'
                     AND child.binding_state = 'active'
                     AND NULLIF(btrim(child.diagnostic_locator), '') IS NOT NULL
              ) AS examples ON true
              LEFT JOIN private.platform_v2_training_exercise_targets AS target
                ON target.entry_id = source_nodes.entry_id
               AND target.content_node_id = source_nodes.content_node_id
               AND target.family = 'idiom'
               AND target.direction = p_direction
              LEFT JOIN public.user_training_exercise_state AS state
                ON state.user_id = p_user_id
               AND state.target_id = target.id
        )
        SELECT *
          FROM shaped
         WHERE COALESCE(hidden, false) = false
           AND (
               frozen_until IS NULL
               OR frozen_until <= private.training_reference_now_v1()
           )
         ORDER BY queue_rank, next_review_at NULLS FIRST, created_at, content_node_id
         OFFSET v_offset
         LIMIT v_limit
    LOOP
        BEGIN
            v_target_id := private.ensure_platform_v2_training_exercise_target_v1(
                v_candidate.entry_id,
                v_candidate.content_node_id,
                'idiom',
                p_direction,
                v_candidate.source_revision,
                v_candidate.source_text_fingerprint
            );
        EXCEPTION WHEN raise_exception THEN
            v_error := SQLERRM;
            IF v_error IN (
                'training_exercise_target_rebind_requires_new_node',
                'training_exercise_target_source_not_active'
            ) THEN
                CONTINUE;
            END IF;
            RAISE;
        END;

        SELECT target_key
          INTO v_target_key
          FROM private.platform_v2_training_exercise_targets
         WHERE id = v_target_id;

        RETURN NEXT jsonb_build_object(
            'targetId', v_target_id,
            'targetKey', v_target_key,
            'family', 'idiom',
            'direction', p_direction,
            'entryId', v_candidate.entry_id,
            'contentNodeId', v_candidate.content_node_id,
            'expressionSourcePath', v_candidate.expression_source_path,
            'explanationSourcePath', v_candidate.explanation_source_path,
            'exampleSourcePaths', v_candidate.examples,
            'sourceRevision', v_candidate.source_revision,
            'sourceTextFingerprint', v_candidate.source_text_fingerprint,
            'queueSource', CASE
                WHEN v_candidate.target_id IS NULL THEN 'new'
                WHEN COALESCE(v_candidate.fsrs_enabled, false) = false THEN 'new'
                WHEN v_candidate.next_review_at <= private.training_reference_now_v1()
                     AND COALESCE(v_candidate.fsrs_last_interval, 0) < 1
                    THEN 'learning'
                WHEN v_candidate.next_review_at <= private.training_reference_now_v1()
                    THEN 'review'
                ELSE 'practice'
            END,
            'state', private.platform_v2_training_exercise_state_json_v1(
                p_user_id,
                v_target_id
            )
        );
        v_count := v_count + 1;
        EXIT WHEN v_count >= v_limit;
    END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION private.platform_v2_idiom_exercise_candidates_v1(
    uuid, text, integer, integer
) FROM PUBLIC, anon, authenticated, service_role;

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
    IF p_user_id IS NULL THEN
        RAISE EXCEPTION 'missing_user_id';
    END IF;

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
    v_action_payload jsonb;
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
    IF p_user_id IS NULL THEN
        RAISE EXCEPTION 'missing_user_id';
    END IF;
    IF p_target_id IS NULL THEN
        RAISE EXCEPTION 'missing_target_id';
    END IF;
    IF p_state_revision IS NULL THEN
        RAISE EXCEPTION 'missing_state_revision';
    END IF;
    IF p_review_result NOT IN ('fail', 'hard', 'success', 'easy') THEN
        RAISE EXCEPTION 'invalid_review_result';
    END IF;
    IF p_client_event_id IS NULL THEN
        RAISE EXCEPTION 'missing_client_event_id';
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
    IF p_training_session_id IS NOT NULL
       AND NOT EXISTS (
           SELECT 1
             FROM public.training_sessions AS session
             JOIN public.training_session_exercise_members AS member
               ON member.session_id = session.id
              AND member.target_id = p_target_id
            WHERE session.id = p_training_session_id
              AND session.user_id = p_user_id
              AND member.consumed_at IS NULL
              AND member.unavailable_at IS NULL
       ) THEN
        RAISE EXCEPTION 'training_exercise_session_member_missing';
    END IF;

    v_action_payload := jsonb_strip_nulls(jsonb_build_object(
        'contractVersion', 'platform-training-exercise-action-v1',
        'userId', p_user_id,
        'actionId', 'review-exercise',
        'targetId', p_target_id,
        'stateRevision', p_state_revision,
        'reviewResult', p_review_result,
        'clientEventId', p_client_event_id,
        'trainingSessionId', p_training_session_id,
        'sourceContext', p_source_context
    ));
    v_action_payload_hash := encode(
        digest(v_action_payload::text, 'sha256'),
        'hex'
    );

    PERFORM pg_advisory_xact_lock(
        hashtext(p_user_id::text || ':exercise:' || p_client_event_id::text)
    );

    SELECT *
      INTO v_receipt
      FROM public.platform_v2_training_exercise_action_receipts AS receipt
     WHERE receipt.user_id = p_user_id
       AND receipt.client_event_id = p_client_event_id;
    IF FOUND THEN
        IF v_receipt.action_payload_hash <> v_action_payload_hash THEN
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
        )
        VALUES (
            p_user_id,
            p_target_id,
            v_target_retention,
            v_now
        )
        RETURNING * INTO v_state;
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
    )
    VALUES (
        v_event_id,
        p_user_id,
        p_target_id,
        p_training_session_id,
        'review-exercise',
        p_review_result,
        p_client_event_id,
        v_action_payload_hash,
        p_source_context,
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
    )
    VALUES (
        p_user_id,
        p_client_event_id,
        p_target_id,
        v_action_payload_hash,
        v_event_id,
        v_response,
        v_now
    );

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

COMMIT;
