-- Shared source-entry scope for idiom and sentence Training. Keep the older
-- exercise RPCs callable by cached clients; later migrations wire this scope
-- into each family's new session-start contract.
BEGIN;

CREATE INDEX IF NOT EXISTS platform_v2_content_nodes_active_idiom_entry_idx
  ON private.platform_v2_content_nodes (entry_id)
  WHERE kind = 'idiom' AND binding_state = 'active';

CREATE OR REPLACE FUNCTION private.training_extra_source_entries_v1(
  p_user_id uuid,
  p_list_id uuid,
  p_list_type text,
  p_training_filter jsonb
)
RETURNS TABLE(entry_id uuid)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE
  v_filter jsonb := COALESCE(p_training_filter, '{}'::jsonb);
  v_dictionary_scope jsonb;
  v_dictionary_mode text;
  v_dictionary_language text;
  v_date_window text;
  v_source_id uuid;
  v_target_date date;
  v_timezone text;
  v_activity_requested boolean;
BEGIN
  IF p_user_id IS NULL THEN RAISE EXCEPTION 'missing_user_id'; END IF;
  IF jsonb_typeof(v_filter) <> 'object' THEN
    RAISE EXCEPTION 'invalid_training_filter';
  END IF;
  IF p_list_type IS NOT NULL AND p_list_type NOT IN ('curated', 'user') THEN
    RAISE EXCEPTION 'invalid_training_list_type';
  END IF;

  v_date_window := COALESCE(NULLIF(trim(v_filter->>'dateWindow'), ''), 'all');
  IF v_date_window NOT IN ('all', 'today', 'yesterday', 'daysAgo') THEN
    RAISE EXCEPTION 'invalid_training_date_window';
  END IF;
  IF v_date_window = 'daysAgo' AND (
    COALESCE(v_filter->>'daysAgo', '') !~ '^[0-9]{1,3}$'
    OR (v_filter->>'daysAgo')::integer > 365
  ) THEN
    RAISE EXCEPTION 'invalid_training_days_ago';
  END IF;

  IF v_filter ? 'dictionaryScope' THEN
    v_dictionary_scope := v_filter->'dictionaryScope';
    v_dictionary_mode := NULLIF(trim(v_dictionary_scope->>'mode'), '');
    v_dictionary_language := NULLIF(trim(v_dictionary_scope->>'languageCode'), '');
    IF p_list_id IS NOT NULL OR jsonb_typeof(v_dictionary_scope) <> 'object'
       OR v_dictionary_mode IS NULL OR v_dictionary_mode NOT IN ('all', 'selected')
       OR v_dictionary_language IS NULL THEN
      RAISE EXCEPTION 'training_material_unavailable';
    END IF;
    IF v_dictionary_mode = 'selected' AND (
      jsonb_typeof(v_dictionary_scope->'dictionaryIds') IS DISTINCT FROM 'array'
      OR jsonb_array_length(v_dictionary_scope->'dictionaryIds') = 0
      OR EXISTS (
        SELECT 1
        FROM jsonb_array_elements_text(v_dictionary_scope->'dictionaryIds') AS requested(id)
        WHERE requested.id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      )
    ) THEN
      RAISE EXCEPTION 'training_material_unavailable';
    END IF;
  END IF;

  IF NULLIF(v_filter->>'sourceId', '') IS NOT NULL THEN
    IF v_filter->>'sourceId' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      RAISE EXCEPTION 'invalid_training_source_id';
    END IF;
    v_source_id := (v_filter->>'sourceId')::uuid;
  END IF;
  v_activity_requested := v_date_window <> 'all'
    OR v_source_id IS NOT NULL
    OR NULLIF(trim(v_filter->>'sourceKind'), '') IS NOT NULL
    OR NULLIF(trim(v_filter->>'externalId'), '') IS NOT NULL;
  v_target_date := private.training_filter_target_date_at(
    v_filter, private.training_reference_now_v1()
  );
  v_timezone := private.training_schedule_timezone_v1(
    COALESCE(
      NULLIF(trim(v_filter->>'timezone'), ''),
      private.training_user_timezone_v1(p_user_id)
    )
  );

  RETURN QUERY
  WITH readable_dictionaries AS MATERIALIZED (
    SELECT dictionary.id, dictionary.language_code
    FROM public.dictionaries AS dictionary
    WHERE public.can_access_dictionary(p_user_id, dictionary.id, 'read')
  ), selected_dictionaries AS MATERIALIZED (
    SELECT requested.id::uuid AS id
    FROM jsonb_array_elements_text(
      CASE WHEN v_dictionary_mode = 'selected'
        THEN v_dictionary_scope->'dictionaryIds'
        ELSE '[]'::jsonb END
    ) AS requested(id)
  ), scope AS MATERIALIZED (
    SELECT default_scope.entry_id AS id
    FROM private.default_training_scope_entries_v1 AS default_scope
    WHERE p_list_id IS NULL AND v_dictionary_mode IS NULL

    UNION ALL
    SELECT item.word_id AS id
    FROM public.word_list_items AS item
    WHERE p_list_id IS NOT NULL AND v_dictionary_mode IS NULL
      AND COALESCE(p_list_type, 'curated') = 'curated'
      AND item.list_id = p_list_id

    UNION ALL
    SELECT item.word_id AS id
    FROM public.user_word_list_items AS item
    JOIN public.user_word_lists AS list ON list.id = item.list_id
    WHERE p_list_id IS NOT NULL AND v_dictionary_mode IS NULL
      AND p_list_type = 'user' AND list.user_id = p_user_id
      AND item.list_id = p_list_id

    UNION ALL
    SELECT entry.id
    FROM public.word_entries AS entry
    JOIN readable_dictionaries AS dictionary ON dictionary.id = entry.dictionary_id
    WHERE v_dictionary_mode IN ('all', 'selected')
      AND entry.language_code = v_dictionary_language
      AND dictionary.language_code = v_dictionary_language
      AND (v_dictionary_mode = 'all' OR EXISTS (
        SELECT 1 FROM selected_dictionaries AS selected
        WHERE selected.id = entry.dictionary_id
      ))
  )
  SELECT DISTINCT entry.id
  FROM scope
  JOIN public.word_entries AS entry ON entry.id = scope.id
  LEFT JOIN readable_dictionaries AS dictionary ON dictionary.id = entry.dictionary_id
  WHERE (entry.dictionary_id IS NULL OR dictionary.id IS NOT NULL)
    AND NOT private.is_pointer_only_dictionary_entry_v1(entry.raw)
    AND private.training_lexical_candidate_matches_v1(
      entry.part_of_speech, entry.gender, v_filter
    )
    AND (NOT v_activity_requested OR EXISTS (
      SELECT 1
      FROM public.user_card_action_events AS event
      LEFT JOIN public.learning_sources AS source ON source.id = event.source_id
      WHERE event.user_id = p_user_id AND event.entry_id = entry.id
        AND event.card_type_id IN ('word-to-definition', 'definition-to-word')
        AND (v_target_date IS NULL OR
          private.training_filter_local_date(event.created_at, v_timezone) = v_target_date)
        AND (v_source_id IS NULL OR event.source_id = v_source_id)
        AND (NULLIF(trim(v_filter->>'sourceKind'), '') IS NULL
          OR source.kind = v_filter->>'sourceKind'
          OR source.provider = v_filter->>'sourceKind'
          OR (v_filter->>'sourceKind' = 'youtube' AND
            (source.kind IN ('youtube', 'youtube_video') OR source.provider = 'youtube')))
        AND (NULLIF(trim(v_filter->>'externalId'), '') IS NULL
          OR source.external_id = v_filter->>'externalId')
    ));
END;
$$;

ALTER FUNCTION private.training_extra_source_entries_v1(uuid, uuid, text, jsonb)
  OWNER TO postgres;
REVOKE ALL ON FUNCTION private.training_extra_source_entries_v1(uuid, uuid, text, jsonb)
  FROM PUBLIC, anon, authenticated, service_role;


-- The v1 candidate reader remains unchanged for cached clients. The new
-- family session start calls this filtered candidate reader directly.
CREATE OR REPLACE FUNCTION private.platform_v2_idiom_exercise_candidates_v2(
    p_user_id uuid,
    p_direction text,
    p_limit integer,
    p_offset integer,
    p_list_id uuid,
    p_list_type text,
    p_card_filter text,
    p_training_filter jsonb
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
    v_error text;
    v_limit integer := GREATEST(COALESCE(p_limit, 20), 1);
    v_offset integer := GREATEST(COALESCE(p_offset, 0), 0);
BEGIN
    IF p_user_id IS NULL THEN
        RAISE EXCEPTION 'missing_user_id';
    END IF;
    IF p_direction NOT IN ('direct', 'reverse') THEN
        RAISE EXCEPTION 'invalid_idiom_exercise_direction';
    END IF;
    IF p_card_filter NOT IN ('new', 'review', 'both') THEN
        RAISE EXCEPTION 'invalid card filter: %', p_card_filter;
    END IF;

    FOR v_candidate IN
        WITH readable_dictionaries AS MATERIALIZED (
            SELECT dictionary.id
              FROM public.dictionaries AS dictionary
             WHERE public.can_access_dictionary(p_user_id, dictionary.id, 'read')
        ), eligible_seed AS MATERIALIZED (
            SELECT status.entry_id
              FROM public.user_card_status AS status
              JOIN public.word_entries AS entry ON entry.id = status.entry_id
              LEFT JOIN readable_dictionaries AS readable
                ON readable.id = entry.dictionary_id
             WHERE status.user_id = p_user_id
               AND status.card_type_id IN ('word-to-definition', 'definition-to-word')
               AND (
                   COALESCE(status.in_learning, false)
                   OR COALESCE(status.fsrs_enabled, false)
                   OR COALESCE(status.fsrs_reps, 0) > 0
                   OR status.last_reviewed_at IS NOT NULL
               )
               AND (entry.dictionary_id IS NULL OR readable.id IS NOT NULL)
            UNION
            SELECT known.entry_id
              FROM public.user_card_known_marks AS known
              JOIN public.word_entries AS entry ON entry.id = known.entry_id
              LEFT JOIN readable_dictionaries AS readable
                ON readable.id = entry.dictionary_id
             WHERE known.user_id = p_user_id
               AND known.card_type_id IN ('word-to-definition', 'definition-to-word')
               AND known.cleared_at IS NULL
               AND (entry.dictionary_id IS NULL OR readable.id IS NOT NULL)
        ), eligible_source_groups AS MATERIALIZED (
            SELECT DISTINCT source_group.id
              FROM eligible_seed AS seed
              JOIN private.source_entry_bindings AS binding
                ON binding.word_entry_id = seed.entry_id
               AND binding.binding_state = 'active'
              JOIN private.platform_v2_headword_groups AS source_group
                ON source_group.management_kind = 'source'
               AND source_group.dictionary_id = binding.dictionary_id
               AND source_group.identity_scheme_version = binding.identity_scheme_version
               AND source_group.source_group_key = binding.source_group_key
        ), source_entries AS MATERIALIZED (
            SELECT entry_id
              FROM private.training_extra_source_entries_v1(
                  p_user_id, p_list_id, p_list_type, p_training_filter
              )
        ), source_nodes AS (
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
              LEFT JOIN private.source_entry_bindings AS source_binding
                ON source_binding.word_entry_id = node.entry_id
               AND source_binding.binding_state = 'active'
              LEFT JOIN private.platform_v2_headword_groups AS source_group
                ON source_group.management_kind = 'source'
               AND source_group.dictionary_id = source_binding.dictionary_id
               AND source_group.identity_scheme_version = source_binding.identity_scheme_version
               AND source_group.source_group_key = source_binding.source_group_key
              LEFT JOIN eligible_source_groups AS eligible_group
                ON eligible_group.id = source_group.id
              LEFT JOIN eligible_seed AS direct_seed
                ON direct_seed.entry_id = node.entry_id
             WHERE node.kind = 'idiom'
               AND node.binding_state = 'active'
               AND EXISTS (
                   SELECT 1 FROM source_entries AS source_entry
                   WHERE source_entry.entry_id = node.entry_id
               )
               AND (
                   eligible_group.id IS NOT NULL
                   OR (source_group.id IS NULL AND direct_seed.entry_id IS NOT NULL)
               )
               AND (
                   SELECT count(*)
                     FROM private.platform_v2_content_nodes AS explanation
                    WHERE explanation.parent_content_node_id = node.id
                      AND explanation.kind = 'idiom-explanation'
                      AND explanation.binding_state = 'active'
               ) = 1
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
        ), ranked AS (
            SELECT shaped.*,
                   row_number() OVER (
                       PARTITION BY CASE WHEN queue_rank = 0 THEN 0 ELSE 1 END
                       ORDER BY queue_rank, next_review_at NULLS FIRST,
                                created_at, content_node_id
                   ) AS queue_ordinal
              FROM shaped
             WHERE COALESCE(hidden, false) = false
               AND (
                   frozen_until IS NULL
                   OR frozen_until <= private.training_reference_now_v1()
               )
               AND (
                   (p_card_filter IN ('both', 'new') AND queue_rank = 0)
                   OR (p_card_filter IN ('both', 'review') AND queue_rank IN (1, 2))
               )
        )
        SELECT *
          FROM ranked
         WHERE queue_ordinal > v_offset
           AND queue_ordinal <= v_offset::bigint + v_limit::bigint
         ORDER BY queue_rank, next_review_at NULLS FIRST, created_at, content_node_id
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
    END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION private.platform_v2_idiom_exercise_candidates_v2(
    uuid, text, integer, integer, uuid, text, text, jsonb
) FROM PUBLIC, anon, authenticated, service_role;


-- This overload latches the exact selected source scope and ratio into the
-- same single-active-run authority. The four-argument legacy start remains.
CREATE OR REPLACE FUNCTION private.start_platform_v2_idiom_training_session_v2(
    p_user_id uuid,
    p_direction text,
    p_session_size text,
    p_request_id uuid,
    p_list_id uuid,
    p_list_type text,
    p_card_filter text,
    p_training_filter jsonb,
    p_new_review_ratio integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, extensions, pg_temp
AS $$
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
    IF p_direction NOT IN ('direct', 'reverse') THEN
        RAISE EXCEPTION 'invalid_idiom_exercise_direction';
    END IF;
    IF p_request_id IS NULL THEN
        RAISE EXCEPTION 'missing_idiom_training_session_request_id';
    END IF;
    IF p_card_filter NOT IN ('new', 'review', 'both') THEN
        RAISE EXCEPTION 'invalid card filter: %', p_card_filter;
    END IF;
    IF p_new_review_ratio IS NULL OR p_new_review_ratio NOT BETWEEN 1 AND 5 THEN
        RAISE EXCEPTION 'invalid new/review ratio: %', p_new_review_ratio;
    END IF;
    IF jsonb_typeof(v_filter) <> 'object' THEN
        RAISE EXCEPTION 'invalid_training_filter';
    END IF;
    IF v_size !~ '^[1-9][0-9]*$' OR length(v_size) > 9 THEN
        RAISE EXCEPTION 'invalid idiom training session size: %', v_size;
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
        'exerciseFamily', 'idiom',
        'direction', p_direction,
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
        'idiom',
        v_size,
        ARRAY['idiom:' || p_direction],
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
          FROM private.platform_v2_idiom_exercise_candidates_v2(
              p_user_id, p_direction, v_requested_total, 0,
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

REVOKE ALL ON FUNCTION private.start_platform_v2_idiom_training_session_v2(
    uuid, text, text, uuid, uuid, text, text, jsonb, integer
)
    FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.start_platform_v2_idiom_training_session(
    p_user_id uuid,
    p_direction text,
    p_session_size text,
    p_request_id uuid,
    p_list_id uuid,
    p_list_type text,
    p_card_filter text,
    p_training_filter jsonb,
    p_new_review_ratio integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, extensions, pg_temp
AS $$
BEGIN
    RETURN private.start_platform_v2_idiom_training_session_v2(
        p_user_id,
        p_direction,
        p_session_size,
        p_request_id,
        p_list_id,
        p_list_type,
        p_card_filter,
        p_training_filter,
        p_new_review_ratio
    );
END;
$$;

ALTER FUNCTION public.start_platform_v2_idiom_training_session(
    uuid, text, text, uuid, uuid, text, text, jsonb, integer
)
    OWNER TO postgres;
REVOKE ALL ON FUNCTION public.start_platform_v2_idiom_training_session(
    uuid, text, text, uuid, uuid, text, text, jsonb, integer
)
    FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.start_platform_v2_idiom_training_session(
    uuid, text, text, uuid, uuid, text, text, jsonb, integer
)
    TO authenticated;

-- PostgREST must see the new named-argument overload before app traffic uses it.
NOTIFY pgrst, 'reload schema';

COMMIT;
