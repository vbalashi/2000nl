-- Wire the content-bound idiom runtime into the existing Training session
-- authority. The ordinary meaning queue remains unchanged; idiom sessions
-- use the additive exercise-member table and the same active-run pointer.

BEGIN;

ALTER TABLE public.training_sessions
    ADD COLUMN IF NOT EXISTS exercise_family text NOT NULL DEFAULT 'meaning';

ALTER TABLE public.training_sessions
    DROP CONSTRAINT IF EXISTS training_sessions_exercise_family_check;
ALTER TABLE public.training_sessions
    ADD CONSTRAINT training_sessions_exercise_family_check
    CHECK (exercise_family IN ('meaning', 'idiom', 'translation'));

CREATE INDEX IF NOT EXISTS training_sessions_user_family_created_idx
    ON public.training_sessions(user_id, exercise_family, created_at DESC);

CREATE TABLE IF NOT EXISTS public.training_exercise_run_start_receipts (
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    request_id uuid NOT NULL,
    exercise_family text NOT NULL CHECK (exercise_family IN ('idiom', 'translation')),
    direction text NOT NULL,
    session_size text NOT NULL,
    request_hash text NOT NULL,
    session_id uuid NOT NULL REFERENCES public.training_sessions(id) ON DELETE RESTRICT,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, request_id)
);

ALTER TABLE public.training_exercise_run_start_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.training_exercise_run_start_receipts
    FROM PUBLIC, anon, authenticated, service_role;

-- Add the family to the shared run response without changing any ordinary
-- response fields or its ownership rules.
CREATE OR REPLACE FUNCTION private.training_session_run_response_v1(
    p_user_id uuid,
    p_session_id uuid
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, private, extensions, pg_temp
AS $$
    SELECT jsonb_build_object(
        'sessionId', session.id,
        'sessionSize', session.session_size,
        'requestedTotal', session.requested_total,
        'plannedNew', session.planned_new,
        'plannedReview', session.planned_review,
        'plannedPractice', session.planned_practice,
        'plannedTotal', session.planned_total,
        'plannedAt', session.created_at,
        'runStatus', CASE
            WHEN active.session_id = session.id THEN 'active'
            ELSE 'superseded'
        END,
        'runGeneration', CASE
            WHEN active.session_id = session.id THEN active.generation
            ELSE NULL
        END
    )
      FROM public.training_sessions AS session
      LEFT JOIN public.training_active_runs AS active
        ON active.user_id = session.user_id
     WHERE session.id = p_session_id
       AND session.user_id = p_user_id;
$$;

REVOKE ALL ON FUNCTION private.training_session_run_response_v1(uuid, uuid)
    FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION private.training_idiom_session_response_v1(
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
            'contractVersion', 'platform-idiom-exercise-session-v2',
            'exerciseFamily', 'idiom',
            'direction', split_part(session.card_type_ids[1], ':', 2),
            'completedActions', COALESCE(completed.actions, 0),
            'completionReason', session.completion_reason,
            'members', COALESCE(members.items, '[]'::jsonb)
        )
      FROM public.training_sessions AS session
      LEFT JOIN LATERAL (
          SELECT count(*)::integer AS actions
            FROM public.training_session_exercise_members AS member
           WHERE member.session_id = session.id
             AND member.consumed_at IS NOT NULL
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
            JOIN public.word_entries AS entry
              ON entry.id = target.entry_id
           WHERE member.session_id = session.id
             AND (
                 entry.dictionary_id IS NULL
                 OR public.can_access_dictionary(p_user_id, entry.dictionary_id, 'read')
             )
             AND private.platform_v2_training_ordinary_meaning_eligible_v1(
                 p_user_id,
                 target.entry_id
             )
      ) AS members ON true
     WHERE session.id = p_session_id
       AND session.user_id = p_user_id
       AND session.exercise_family = 'idiom';
$$;

REVOKE ALL ON FUNCTION private.training_idiom_session_response_v1(uuid, uuid)
    FROM PUBLIC, anon, authenticated, service_role;

-- The shared member table is intentionally additive. Keep its consumer
-- fenced to the exercise family so an idiom action cannot consume an
-- ordinary-session member even if a malformed request reaches the RPC.
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
    IF NOT FOUND OR v_session.exercise_family IS DISTINCT FROM 'idiom' THEN
        RAISE EXCEPTION 'training_exercise_session_family_mismatch';
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
    IF NOT FOUND OR v_expected.target_id IS DISTINCT FROM v_member.target_id THEN
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

CREATE OR REPLACE FUNCTION private.start_platform_v2_idiom_training_session_v1(
    p_user_id uuid,
    p_direction text,
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
    v_candidate_offset integer := 0;
    v_candidate_page_size integer;
    v_candidate_page_count integer;
    v_candidate_count integer := 0;
    v_candidate_new_count integer := 0;
    v_candidate_review_count integer := 0;
    v_saw_practice boolean;
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
    IF p_direction NOT IN ('direct', 'reverse') THEN
        RAISE EXCEPTION 'invalid_idiom_exercise_direction';
    END IF;
    IF p_request_id IS NULL THEN
        RAISE EXCEPTION 'missing_idiom_training_session_request_id';
    END IF;
    IF v_size !~ '^[1-9][0-9]*$' OR length(v_size) > 9 THEN
        RAISE EXCEPTION 'invalid idiom training session size: %', v_size;
    END IF;
    v_requested_total := v_size::integer;
    v_request_hash := encode(digest(jsonb_build_object(
        'exerciseFamily', 'idiom',
        'direction', p_direction,
        'sessionSize', v_size
    )::text, 'sha256'), 'hex');

    -- The same request is safe to retry. The receipt does not reclaim an old
    -- run; it returns that run's authoritative status.
    PERFORM pg_advisory_xact_lock(hashtext('training-active-run:' || p_user_id::text));
    SELECT *
      INTO v_receipt
      FROM public.training_exercise_run_start_receipts AS receipt
     WHERE receipt.user_id = p_user_id
       AND receipt.request_id = p_request_id
     FOR UPDATE;
    IF FOUND THEN
        IF v_receipt.request_hash IS DISTINCT FROM v_request_hash THEN
            RAISE EXCEPTION 'idiom_training_session_start_idempotency_conflict';
        END IF;
        RETURN private.training_idiom_session_response_v1(p_user_id, v_receipt.session_id);
    END IF;

    INSERT INTO public.training_sessions (
        id,
        user_id,
        exercise_family,
        session_size,
        card_type_ids,
        list_type,
        card_filter,
        training_filter,
        requested_total,
        created_at
    ) VALUES (
        v_session_id,
        p_user_id,
        'idiom',
        v_size,
        ARRAY['idiom:' || p_direction],
        'curated',
        'both',
        '{}'::jsonb,
        v_requested_total,
        v_now
    );

    -- Candidate ordering and eligibility remain owned by migration 154. The
    -- loop pages until it has enough candidates from both immediate queues.
    -- The candidate RPC sorts practice last; once that tail is observed there
    -- cannot be another new/review row, so the loop does not scan the whole
    -- future-practice pool.
    LOOP
        v_candidate_page_size := LEAST(100, v_requested_total);
        EXIT WHEN v_candidate_page_size <= 0;
        v_candidate_page_count := 0;
        v_saw_practice := false;

        FOR v_candidate IN
            SELECT candidate.item
              FROM private.platform_v2_idiom_exercise_candidates_v1(
                  p_user_id,
                  p_direction,
                  v_candidate_page_size,
                  v_candidate_offset
              ) AS candidate(item)
        LOOP
            v_candidate_page_count := v_candidate_page_count + 1;
            IF v_candidate->>'queueSource' = 'practice' THEN
                v_saw_practice := true;
            ELSIF v_candidate->>'queueSource' = 'new' THEN
                v_candidates := array_append(v_candidates, v_candidate);
                v_candidate_count := v_candidate_count + 1;
                v_candidate_new_count := v_candidate_new_count + 1;
            ELSIF v_candidate->>'queueSource' IN ('learning', 'review') THEN
                v_candidates := array_append(v_candidates, v_candidate);
                v_candidate_count := v_candidate_count + 1;
                v_candidate_review_count := v_candidate_review_count + 1;
            END IF;
        END LOOP;

        EXIT WHEN v_candidate_page_count = 0
            OR (
                v_candidate_new_count >= v_requested_total
                AND v_candidate_review_count >= v_requested_total
            )
            OR v_saw_practice;
        v_candidate_offset := v_candidate_offset + v_candidate_page_size;
    END LOOP;

    -- Reuse the learner's soft new/review preference. It is a preference for
    -- ordering, never a quota: whichever category is available is used.
    FOR v_candidate IN SELECT item FROM unnest(v_candidates) AS item LOOP
        IF v_candidate->>'queueSource' = 'new' THEN
            v_new_candidates := array_append(v_new_candidates, v_candidate);
        ELSE
            v_review_candidates := array_append(v_review_candidates, v_candidate);
        END IF;
    END LOOP;

    SELECT LEAST(5, GREATEST(1, COALESCE(settings.new_review_ratio, 2)))::integer
      INTO v_ratio
      FROM public.user_settings AS settings
     WHERE settings.user_id = p_user_id;
    v_ratio := COALESCE(v_ratio, 2);

    WHILE v_ordinal < v_requested_total
      AND (
          v_new_index <= COALESCE(array_length(v_new_candidates, 1), 0)
          OR v_review_index <= COALESCE(array_length(v_review_candidates, 1), 0)
      )
    LOOP
        IF v_ordinal = 0
           AND v_new_index <= COALESCE(array_length(v_new_candidates, 1), 0) THEN
            v_candidate := v_new_candidates[v_new_index];
            v_new_index := v_new_index + 1;
            v_reviews_since_new := 0;
        ELSIF v_review_index <= COALESCE(array_length(v_review_candidates, 1), 0)
              AND (
                  v_new_index > COALESCE(array_length(v_new_candidates, 1), 0)
                  OR v_reviews_since_new < v_ratio
              ) THEN
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
        IF v_target_id IS NULL
           OR v_queue_source IS NULL
           OR v_queue_source NOT IN ('new', 'learning', 'review') THEN
            RAISE EXCEPTION 'invalid_idiom_session_candidate';
        END IF;
        v_ordinal := v_ordinal + 1;
        INSERT INTO public.training_session_exercise_members (
            session_id, target_id, ordinal, queue_source
        ) VALUES (
            v_session_id, v_target_id, v_ordinal, v_queue_source
        );
    END LOOP;

    SELECT count(*) FILTER (WHERE queue_source = 'new')::integer,
           count(*) FILTER (WHERE queue_source IN ('learning', 'review'))::integer,
           count(*)::integer
      INTO v_planned_new, v_planned_review, v_planned_total
      FROM public.training_session_exercise_members AS member
     WHERE member.session_id = v_session_id;

    UPDATE public.training_sessions
       SET planned_new = COALESCE(v_planned_new, 0),
           planned_review = COALESCE(v_planned_review, 0),
           planned_practice = 0,
           planned_total = COALESCE(v_planned_total, 0),
           completed_at = CASE WHEN COALESCE(v_planned_total, 0) = 0 THEN v_now END,
           exhausted_at = CASE WHEN COALESCE(v_planned_total, 0) = 0 THEN v_now END,
           completion_reason = CASE
               WHEN COALESCE(v_planned_total, 0) = 0 THEN 'exhausted'
           END
     WHERE id = v_session_id;

    INSERT INTO public.training_exercise_run_start_receipts (
        user_id, request_id, exercise_family, direction, session_size,
        request_hash, session_id, created_at
    ) VALUES (
        p_user_id, p_request_id, 'idiom', p_direction, v_size,
        v_request_hash, v_session_id, v_now
    );

    RETURN private.training_idiom_session_response_v1(p_user_id, v_session_id);
END;
$$;

REVOKE ALL ON FUNCTION private.start_platform_v2_idiom_training_session_v1(uuid, text, text, uuid)
    FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.start_platform_v2_idiom_training_session(
    p_user_id uuid,
    p_direction text,
    p_session_size text,
    p_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, extensions, pg_temp
AS $$
BEGIN
    RETURN private.start_platform_v2_idiom_training_session_v1(
        p_user_id,
        p_direction,
        p_session_size,
        p_request_id
    );
END;
$$;

ALTER FUNCTION public.start_platform_v2_idiom_training_session(uuid, text, text, uuid)
    OWNER TO postgres;
REVOKE ALL ON FUNCTION public.start_platform_v2_idiom_training_session(uuid, text, text, uuid)
    FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.start_platform_v2_idiom_training_session(uuid, text, text, uuid)
    TO authenticated;

-- Keep the action's direction inside the trusted RPC boundary. The target id
-- already encodes direction, but the application request also carries it and
-- must not be able to mutate one direction while claiming the other.
CREATE OR REPLACE FUNCTION public.perform_platform_v2_idiom_exercise_action_as_principal_v1(
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
    IF v_jwt_role IS DISTINCT FROM 'service_role' THEN
        RAISE EXCEPTION 'unauthorized';
    END IF;
    IF p_user_id IS NULL THEN
        RAISE EXCEPTION 'missing_user_id';
    END IF;
    IF p_direction NOT IN ('direct', 'reverse') THEN
        RAISE EXCEPTION 'invalid_idiom_exercise_direction';
    END IF;
    IF NOT EXISTS (
        SELECT 1
          FROM private.platform_v2_training_exercise_targets AS target
         WHERE target.id = p_target_id
           AND target.family = 'idiom'
           AND target.direction = p_direction
    ) THEN
        RAISE EXCEPTION 'training_exercise_target_direction_mismatch';
    END IF;
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

ALTER FUNCTION public.perform_platform_v2_idiom_exercise_action_as_principal_v1(
    uuid, uuid, text, text, uuid, text, uuid, jsonb
) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.perform_platform_v2_idiom_exercise_action_as_principal_v1(
    uuid, uuid, text, text, uuid, text, uuid, jsonb
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.perform_platform_v2_idiom_exercise_action_as_principal_v1(
    uuid, uuid, text, text, uuid, text, uuid, jsonb
) TO service_role;

CREATE OR REPLACE FUNCTION public.read_platform_v2_idiom_training_session_snapshot(
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
    v_run jsonb;
BEGIN
    IF (select auth.uid()) IS NULL OR p_user_id IS DISTINCT FROM (select auth.uid()) THEN
        RAISE EXCEPTION 'unauthorized: user_id does not match authenticated user';
    END IF;

    SELECT *
      INTO v_session
      FROM public.training_sessions AS session
     WHERE session.id = p_session_id
       AND session.user_id = p_user_id
       AND session.exercise_family = 'idiom';
    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    RETURN private.training_idiom_session_response_v1(p_user_id, p_session_id);
END;
$$;

ALTER FUNCTION public.read_platform_v2_idiom_training_session_snapshot(uuid, uuid)
    OWNER TO postgres;
REVOKE ALL ON FUNCTION public.read_platform_v2_idiom_training_session_snapshot(uuid, uuid)
    FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.read_platform_v2_idiom_training_session_snapshot(uuid, uuid)
    TO authenticated;

CREATE OR REPLACE FUNCTION public.read_platform_v2_idiom_training_session_next(
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

    SELECT *
      INTO v_session
      FROM public.training_sessions AS session
     WHERE session.id = p_session_id
       AND session.user_id = p_user_id
       AND session.exercise_family = 'idiom';
    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'not-member');
    END IF;

    IF NOT EXISTS (
        SELECT 1
          FROM public.training_active_runs AS active
         WHERE active.user_id = p_user_id
           AND active.session_id = p_session_id
    ) THEN
        RETURN jsonb_build_object(
            'status', 'superseded',
            'sessionId', p_session_id
        );
    END IF;

    SELECT member.*
      INTO v_member
      FROM public.training_session_exercise_members AS member
     WHERE member.session_id = p_session_id
       AND member.consumed_at IS NULL
       AND member.unavailable_at IS NULL
     ORDER BY member.ordinal
     LIMIT 1;
    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'status', CASE
                WHEN v_session.completed_at IS NOT NULL
                    THEN COALESCE(v_session.completion_reason, 'completed')
                ELSE 'exhausted'
            END,
            'sessionId', p_session_id,
            'completedActions', COALESCE((
                SELECT count(*)::integer
                  FROM public.training_session_exercise_members AS member
                 WHERE member.session_id = p_session_id
                   AND member.consumed_at IS NOT NULL
            ), 0),
            'requestedTotal', v_session.requested_total
        );
    END IF;

    IF NOT EXISTS (
        SELECT 1
          FROM private.platform_v2_training_exercise_targets AS target
          JOIN public.word_entries AS entry
            ON entry.id = target.entry_id
         WHERE target.id = v_member.target_id
           AND target.family = 'idiom'
           AND (
               entry.dictionary_id IS NULL
               OR public.can_access_dictionary(p_user_id, entry.dictionary_id, 'read')
           )
           AND private.platform_v2_training_ordinary_meaning_eligible_v1(
               p_user_id,
               target.entry_id
           )
    ) THEN
        SELECT count(*)::integer
          INTO v_remaining
          FROM public.training_session_exercise_members AS member
         WHERE member.session_id = p_session_id
           AND member.consumed_at IS NULL
           AND member.unavailable_at IS NULL;
        RETURN jsonb_build_object(
            'status', 'unavailable',
            'sessionId', p_session_id,
            'ordinal', v_member.ordinal,
            'targetId', v_member.target_id,
            'reason', 'dictionary-access-revoked',
            'remaining', v_remaining
        );
    END IF;

    SELECT jsonb_build_object(
        'targetId', target.id,
        'targetKey', target.target_key,
        'entryId', target.entry_id,
        'contentNodeId', target.content_node_id,
        'family', target.family,
        'direction', target.direction,
        'sourceRevision', target.source_revision,
        'sourceTextFingerprint', target.source_text_fingerprint,
        'expressionSourcePath', expression.diagnostic_locator,
        'explanationSourcePath', explanation.diagnostic_locator,
        'exampleSourcePaths', COALESCE(examples.items, '[]'::jsonb),
        'state', private.platform_v2_training_exercise_state_json_v1(
            p_user_id,
            target.id
        )
    )
      INTO v_payload
      FROM private.platform_v2_training_exercise_targets AS target
      JOIN private.platform_v2_content_nodes AS expression
        ON expression.id = target.content_node_id
       AND expression.entry_id = target.entry_id
       AND expression.kind = 'idiom'
       AND expression.binding_state = 'active'
       AND expression.source_text_fingerprint = target.source_text_fingerprint
      JOIN LATERAL (
          SELECT child.diagnostic_locator
            FROM private.platform_v2_content_nodes AS child
           WHERE child.parent_content_node_id = expression.id
             AND child.kind = 'idiom-explanation'
             AND child.binding_state = 'active'
             AND NULLIF(btrim(child.diagnostic_locator), '') IS NOT NULL
           ORDER BY child.created_at, child.id
           LIMIT 1
      ) AS explanation ON true
      LEFT JOIN LATERAL (
          SELECT jsonb_agg(child.diagnostic_locator ORDER BY child.created_at, child.id) AS items
            FROM private.platform_v2_content_nodes AS child
           WHERE child.parent_content_node_id = expression.id
             AND child.kind = 'example'
             AND child.binding_state = 'active'
             AND NULLIF(btrim(child.diagnostic_locator), '') IS NOT NULL
      ) AS examples ON true
     WHERE target.id = v_member.target_id
       AND target.family = 'idiom'
       AND target.direction IN ('direct', 'reverse')
       AND target.visibility_state = 'active';

    IF v_payload IS NULL THEN
        SELECT count(*)::integer
          INTO v_remaining
          FROM public.training_session_exercise_members AS member
         WHERE member.session_id = p_session_id
           AND member.consumed_at IS NULL
           AND member.unavailable_at IS NULL;
        RETURN jsonb_build_object(
            'status', 'unavailable',
            'sessionId', p_session_id,
            'ordinal', v_member.ordinal,
            'targetId', v_member.target_id,
            'reason', 'projection-missing',
            'remaining', v_remaining
        );
    END IF;

    RETURN v_payload || jsonb_build_object(
        'status', 'ready',
        'sessionId', p_session_id,
        'ordinal', v_member.ordinal,
        'queueSource', v_member.queue_source
    );
END;
$$;

ALTER FUNCTION public.read_platform_v2_idiom_training_session_next(uuid, uuid)
    OWNER TO postgres;
REVOKE ALL ON FUNCTION public.read_platform_v2_idiom_training_session_next(uuid, uuid)
    FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.read_platform_v2_idiom_training_session_next(uuid, uuid)
    TO authenticated;

CREATE OR REPLACE FUNCTION public.mark_platform_v2_idiom_training_session_member_unavailable(
    p_user_id uuid,
    p_session_id uuid,
    p_target_id uuid,
    p_reason text
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
    v_expected public.training_session_exercise_members%rowtype;
    v_remaining integer;
    v_completed integer;
    v_now timestamptz := private.training_reference_now_v1();
BEGIN
    IF (select auth.uid()) IS NULL OR p_user_id IS DISTINCT FROM (select auth.uid()) THEN
        RAISE EXCEPTION 'unauthorized: user_id does not match authenticated user';
    END IF;
    IF p_reason NOT IN ('projection-missing', 'dictionary-access-revoked', 'entry-not-found') THEN
        RAISE EXCEPTION 'invalid_idiom_session_unavailable_reason';
    END IF;
    PERFORM private.require_active_training_session_v1(p_user_id, p_session_id);

    SELECT *
      INTO v_session
      FROM public.training_sessions AS session
     WHERE session.id = p_session_id
       AND session.user_id = p_user_id
       AND session.exercise_family = 'idiom'
     FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'not-member');
    END IF;

    SELECT *
      INTO v_member
      FROM public.training_session_exercise_members AS member
     WHERE member.session_id = p_session_id
       AND member.target_id = p_target_id
     FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'not-member');
    END IF;
    IF v_member.consumed_at IS NOT NULL THEN
        RETURN jsonb_build_object('status', 'consumed', 'ordinal', v_member.ordinal);
    END IF;
    IF v_member.unavailable_at IS NOT NULL THEN
        RETURN jsonb_build_object(
            'status', 'unavailable',
            'ordinal', v_member.ordinal,
            'reason', v_member.unavailable_reason
        );
    END IF;

    SELECT *
      INTO v_expected
      FROM public.training_session_exercise_members AS member
     WHERE member.session_id = p_session_id
       AND member.consumed_at IS NULL
       AND member.unavailable_at IS NULL
     ORDER BY member.ordinal
     LIMIT 1;
    IF v_expected.target_id IS DISTINCT FROM p_target_id THEN
        RETURN jsonb_build_object(
            'status', 'out-of-order',
            'ordinal', v_member.ordinal,
            'expectedOrdinal', v_expected.ordinal
        );
    END IF;

    UPDATE public.training_session_exercise_members
       SET unavailable_at = v_now,
           unavailable_reason = p_reason
     WHERE session_id = p_session_id
       AND target_id = p_target_id;

    SELECT count(*) FILTER (
               WHERE member.consumed_at IS NULL
                 AND member.unavailable_at IS NULL
           )::integer,
           count(*) FILTER (WHERE member.consumed_at IS NOT NULL)::integer
      INTO v_remaining, v_completed
      FROM public.training_session_exercise_members AS member
     WHERE member.session_id = p_session_id;

    IF v_remaining = 0 THEN
        UPDATE public.training_sessions
           SET completed_at = COALESCE(completed_at, v_now),
               exhausted_at = COALESCE(exhausted_at, v_now),
               completion_reason = COALESCE(completion_reason, 'exhausted')
         WHERE id = p_session_id;
    END IF;

    RETURN jsonb_build_object(
        'status', CASE WHEN v_remaining = 0 THEN 'unavailable-exhausted' ELSE 'unavailable' END,
        'ordinal', v_member.ordinal,
        'reason', p_reason,
        'remaining', v_remaining,
        'completedActions', v_completed
    );
END;
$$;

ALTER FUNCTION public.mark_platform_v2_idiom_training_session_member_unavailable(uuid, uuid, uuid, text)
    OWNER TO postgres;
REVOKE ALL ON FUNCTION public.mark_platform_v2_idiom_training_session_member_unavailable(uuid, uuid, uuid, text)
    FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.mark_platform_v2_idiom_training_session_member_unavailable(uuid, uuid, uuid, text)
    TO authenticated;

CREATE OR REPLACE FUNCTION public.reconcile_platform_v2_idiom_receipt_as_principal(
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
    IF v_jwt_role IS DISTINCT FROM 'service_role' THEN
        RAISE EXCEPTION 'unauthorized';
    END IF;
    IF p_user_id IS NULL OR p_client_event_id IS NULL THEN
        RAISE EXCEPTION 'missing_training_exercise_receipt_identity';
    END IF;

    PERFORM pg_advisory_xact_lock(
        hashtext(p_user_id::text || ':exercise:' || p_client_event_id::text)
    );
    SELECT *
      INTO v_receipt
      FROM public.platform_v2_training_exercise_action_receipts AS receipt
     WHERE receipt.user_id = p_user_id
       AND receipt.client_event_id = p_client_event_id;
    IF NOT FOUND THEN
        RETURN NULL;
    END IF;
    SELECT *
      INTO v_event
      FROM public.user_training_exercise_action_events AS event
     WHERE event.id = v_receipt.event_id
       AND event.user_id = p_user_id
       AND event.action = 'review-exercise';
    IF NOT FOUND THEN
        RAISE EXCEPTION 'training_exercise_action_receipt_event_missing';
    END IF;
    RETURN v_receipt.response || jsonb_build_object('status', 'duplicate');
END;
$$;

ALTER FUNCTION public.reconcile_platform_v2_idiom_receipt_as_principal(uuid, uuid)
    OWNER TO postgres;
REVOKE ALL ON FUNCTION public.reconcile_platform_v2_idiom_receipt_as_principal(uuid, uuid)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_platform_v2_idiom_receipt_as_principal(uuid, uuid)
    TO service_role;

COMMIT;
