-- Add scoped sentence selection before queue limits. Preserve the migration-169 pair exclusion guard.
BEGIN;
CREATE OR REPLACE FUNCTION private.training_translation_source_nodes_v1(
 p_user_id uuid, p_list_id uuid, p_list_type text, p_training_filter jsonb
) RETURNS TABLE(content_node_id uuid, entry_id uuid, source_path text,
 source_text_fingerprint text, created_at timestamptz, source_revision text)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, private, extensions, pg_temp AS $source$
        WITH source_entries AS MATERIALIZED (
            SELECT entry_id FROM private.training_extra_source_entries_v1(
                p_user_id, p_list_id, p_list_type, p_training_filter)
        ), source_nodes AS (
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
               AND EXISTS (SELECT 1 FROM source_entries scope WHERE scope.entry_id = node.entry_id)
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

        ) SELECT * FROM source_nodes;
$source$;
REVOKE ALL ON FUNCTION private.training_translation_source_nodes_v1(uuid,uuid,text,jsonb) FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION private.platform_v2_translation_exercise_candidates_v2(p_user_id uuid, p_limit integer, p_offset integer, p_list_id uuid, p_list_type text, p_card_filter text, p_training_filter jsonb)
 RETURNS SETOF jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'extensions', 'pg_temp'
AS $function$
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
            SELECT * FROM private.training_translation_source_nodes_v1(
                p_user_id,p_list_id,p_list_type,p_training_filter)
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
        ), ranked AS (
        SELECT shaped.*, row_number() OVER (
            PARTITION BY CASE WHEN queue_rank = 0 THEN 0 ELSE 1 END
            ORDER BY queue_rank, next_review_at NULLS FIRST, created_at, content_node_id
        ) AS queue_ordinal
         FROM shaped
         WHERE COALESCE(hidden, false) = false
               AND NOT EXISTS (SELECT 1 FROM private.training_pair_exclusions exclusion
                 WHERE exclusion.user_id=p_user_id AND exclusion.restored_at IS NULL
                   AND exclusion.pair_key=private.training_pair_key_v1(
                     'translation', shaped.entry_id, shaped.content_node_id, shaped.source_text_fingerprint, NULL))
           AND (frozen_until IS NULL OR frozen_until <= private.training_reference_now_v1())
           AND ((p_card_filter IN ('both','new') AND queue_rank = 0)
             OR (p_card_filter IN ('both','review') AND queue_rank IN (1,2)))
        )
        SELECT * FROM ranked
        WHERE queue_ordinal > v_offset AND queue_ordinal <= v_offset::bigint + v_limit
        ORDER BY queue_rank, next_review_at NULLS FIRST, created_at, content_node_id
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

    END LOOP;
END;
$function$;
CREATE OR REPLACE FUNCTION private.start_platform_v2_translation_training_session_v2(p_user_id uuid, p_session_size text, p_request_id uuid, p_list_id uuid, p_list_type text, p_card_filter text, p_training_filter jsonb, p_new_review_ratio integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'extensions', 'pg_temp'
AS $function$
DECLARE
    v_session_id uuid := gen_random_uuid();
    v_size text := COALESCE(NULLIF(btrim(p_session_size), ''), '10');
    v_filter jsonb := COALESCE(p_training_filter, '{}'::jsonb);
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
    IF p_request_id IS NULL THEN
        RAISE EXCEPTION 'missing_translation_training_session_request_id';
    END IF;
    IF p_card_filter IS NULL OR p_card_filter NOT IN ('new', 'review', 'both') THEN
        RAISE EXCEPTION 'invalid card filter: %', p_card_filter;
    END IF;
    IF p_new_review_ratio IS NULL OR p_new_review_ratio NOT BETWEEN 1 AND 5 THEN
        RAISE EXCEPTION 'invalid new/review ratio: %', p_new_review_ratio;
    END IF;
    IF jsonb_typeof(v_filter) <> 'object' THEN
        RAISE EXCEPTION 'invalid_training_filter';
    END IF;
    IF v_size !~ '^[1-9][0-9]*$' OR length(v_size) > 9 THEN
        RAISE EXCEPTION 'invalid translation training session size: %', v_size;
    END IF;
    v_requested_total := v_size::integer;
    -- A single-queue run never uses the rhythm. Match the ordinary Training
    -- contract so irrelevant slider values do not change retry identity.
    v_ratio := CASE WHEN p_card_filter = 'both' THEN p_new_review_ratio ELSE 2 END;

    -- These arrays describe selections, not an order. Canonicalize before
    -- storing and hashing so a reordered retry returns the original run.
    IF jsonb_typeof(v_filter->'partOfSpeech') = 'array' THEN
        v_filter := jsonb_set(v_filter, '{partOfSpeech}', (
            SELECT COALESCE(jsonb_agg(value ORDER BY value), '[]'::jsonb)
            FROM (SELECT DISTINCT value FROM jsonb_array_elements_text(
                v_filter->'partOfSpeech'
            ) AS item(value)) AS selected
        ));
    END IF;
    IF jsonb_typeof(v_filter->'nounArticles') = 'array' THEN
        v_filter := jsonb_set(v_filter, '{nounArticles}', (
            SELECT COALESCE(jsonb_agg(value ORDER BY value), '[]'::jsonb)
            FROM (SELECT DISTINCT value FROM jsonb_array_elements_text(
                v_filter->'nounArticles'
            ) AS item(value)) AS selected
        ));
    END IF;
    IF jsonb_typeof(v_filter #> '{dictionaryScope,dictionaryIds}') = 'array' THEN
        v_filter := jsonb_set(v_filter, '{dictionaryScope,dictionaryIds}', (
            SELECT COALESCE(jsonb_agg(value ORDER BY value), '[]'::jsonb)
            FROM (SELECT DISTINCT value FROM jsonb_array_elements_text(
                v_filter #> '{dictionaryScope,dictionaryIds}'
            ) AS item(value)) AS selected
        ));
    END IF;
    v_request_hash := encode(digest(jsonb_build_object(
        'exerciseFamily', 'translation',
        'direction', 'recall',
        'sessionSize', v_size,
        'listId', p_list_id,
        'listType', COALESCE(p_list_type, 'curated'),
        'cardFilter', p_card_filter,
        'trainingFilter', v_filter,
        'newReviewRatio', v_ratio
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
            RAISE EXCEPTION 'translation_training_session_start_idempotency_conflict';
        END IF;
        RETURN private.training_translation_session_response_v1(p_user_id, v_receipt.session_id);
    END IF;

    INSERT INTO public.training_sessions (
        id,
        user_id,
        exercise_family,
        session_size,
        card_type_ids,
        list_id,
        list_type,
        card_filter,
        training_filter,
        requested_total,
        new_review_ratio,
        created_at
    ) VALUES (
        v_session_id,
        p_user_id,
        'translation',
        v_size,
        ARRAY['translation:' || 'recall'],
        p_list_id,
        COALESCE(p_list_type, 'curated'),
        p_card_filter,
        v_filter,
        v_requested_total,
        v_ratio,
        v_now
    );

    -- One candidate read limits each immediate queue independently. A skewed
    -- pool cannot trigger repeated corpus/group scans just to fill the other
    -- side of the optional rhythm.
    FOR v_candidate IN
        SELECT candidate.item
          FROM private.platform_v2_translation_exercise_candidates_v2(
              p_user_id, v_requested_total, 0,
              p_list_id, p_list_type, p_card_filter, v_filter
          ) AS candidate(item)
    LOOP
        IF v_candidate->>'queueSource' = 'new' THEN
            v_candidates := array_append(v_candidates, v_candidate);
        ELSIF v_candidate->>'queueSource' IN ('learning', 'review') THEN
            v_candidates := array_append(v_candidates, v_candidate);
        END IF;
    END LOOP;

    -- Apply the selected soft new/review rhythm. It is a preference for
    -- ordering, never a quota: whichever category is available is used.
    FOR v_candidate IN SELECT item FROM unnest(v_candidates) AS item LOOP
        IF v_candidate->>'queueSource' = 'new' THEN
            v_new_candidates := array_append(v_new_candidates, v_candidate);
        ELSE
            v_review_candidates := array_append(v_review_candidates, v_candidate);
        END IF;
    END LOOP;

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
            RAISE EXCEPTION 'invalid_translation_session_candidate';
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
        p_user_id, p_request_id, 'translation', 'recall', v_size,
        v_request_hash, v_session_id, v_now
    );

    RETURN private.training_translation_session_response_v1(p_user_id, v_session_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.start_platform_v2_translation_training_session_scoped(
  p_user_id uuid, p_session_size text, p_request_id uuid,
  p_list_id uuid, p_list_type text, p_card_filter text,
  p_training_filter jsonb, p_new_review_ratio integer
) RETURNS jsonb LANGUAGE sql SECURITY DEFINER
SET search_path = public, private, extensions, pg_temp AS $$
  SELECT private.start_platform_v2_translation_training_session_v2(
    p_user_id,p_session_size,p_request_id,p_list_id,p_list_type,
    p_card_filter,p_training_filter,p_new_review_ratio);
$$;
REVOKE ALL ON FUNCTION private.platform_v2_translation_exercise_candidates_v2(uuid,integer,integer,uuid,text,text,jsonb) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION private.start_platform_v2_translation_training_session_v2(uuid,text,uuid,uuid,text,text,jsonb,integer) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.start_platform_v2_translation_training_session_scoped(uuid,text,uuid,uuid,text,text,jsonb,integer) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.start_platform_v2_translation_training_session_scoped(uuid,text,uuid,uuid,text,text,jsonb,integer) TO authenticated;
CREATE OR REPLACE FUNCTION public.read_training_translation_stats_v1(p_session_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'private', 'extensions', 'pg_temp'
AS $function$
DECLARE
    v_user_id uuid := (select auth.uid());
    v_session public.training_sessions%rowtype;
    v_direction text;
    v_now timestamptz := private.training_reference_now_v1();
    v_start timestamptz;
    v_end timestamptz;
BEGIN
    IF v_user_id IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
    SELECT * INTO v_session FROM public.training_sessions
      WHERE id = p_session_id AND user_id = v_user_id AND exercise_family = 'translation';
    IF NOT FOUND THEN RAISE EXCEPTION 'training_session_not_found'; END IF;
    v_direction := split_part(v_session.card_type_ids[1], ':', 2);
    IF v_direction IS DISTINCT FROM 'recall' THEN
        RAISE EXCEPTION 'invalid_translation_exercise_direction';
    END IF;
    SELECT start_at, end_at INTO v_start, v_end
      FROM private.training_study_day_bounds_v1(
          v_now, private.training_user_timezone_v1(v_user_id)
      );
    RETURN (
        WITH scoped AS MATERIALIZED (
            SELECT node.content_node_id, target.id AS target_id,
                   private.training_pair_excluded_v1(v_user_id, 'translation', node.entry_id,
                     node.content_node_id, node.source_text_fingerprint, NULL) AS excluded,
                   state.fsrs_enabled, state.next_review_at,
                   state.hidden, state.frozen_until
            FROM private.training_translation_source_nodes_v1(
                v_user_id, v_session.list_id,
                v_session.list_type, v_session.training_filter
            ) node
            LEFT JOIN private.platform_v2_training_exercise_targets target
              ON target.content_node_id = node.content_node_id
             AND target.entry_id = node.entry_id
             AND target.family = 'translation' AND target.direction = v_direction
            LEFT JOIN public.user_training_exercise_state state
              ON state.user_id = v_user_id AND state.target_id = target.id
        ), history AS MATERIALIZED (
            SELECT event.target_id, event.created_at,
                   NOT EXISTS (
                     SELECT 1 FROM public.user_training_exercise_action_events prior
                     WHERE prior.user_id = v_user_id AND prior.target_id = event.target_id
                       AND prior.action = 'review-exercise'
                       AND (prior.created_at, prior.id) < (event.created_at, event.id)
                   ) AS is_introduction
            FROM public.user_training_exercise_action_events event
            JOIN scoped ON scoped.target_id = event.target_id
            WHERE event.user_id = v_user_id AND event.action = 'review-exercise'
              AND event.created_at >= v_start AND event.created_at < v_end
        ), introductions AS (
            SELECT target_id FROM history
            WHERE is_introduction
        )
        SELECT jsonb_build_object(
            'contractVersion', 'training-translation-stats-v1',
            'newCardsToday', (SELECT count(*) FROM introductions),
            'reviewCardsDone', (SELECT count(*) FROM history
                WHERE NOT is_introduction),
            'reviewCardsDue', (SELECT count(*) FROM scoped
                WHERE fsrs_enabled AND next_review_at < v_end
                  AND NOT COALESCE(hidden, false) AND NOT excluded
                  AND (frozen_until IS NULL OR frozen_until <= v_now)
                  AND NOT EXISTS (SELECT 1 FROM introductions intro
                                  WHERE intro.target_id = scoped.target_id)),
            'totalCardsStarted', (SELECT count(*) FROM scoped WHERE fsrs_enabled),
            'totalCardsInScope', (SELECT count(*) FROM scoped)
        )
    );
END;
$function$;
REVOKE ALL ON FUNCTION public.read_training_translation_stats_v1(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.read_training_translation_stats_v1(uuid) TO authenticated;
COMMIT;
