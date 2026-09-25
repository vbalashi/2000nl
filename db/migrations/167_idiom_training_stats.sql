-- Shared read-only idiom scope; the selector retains its existing ranking,
-- pagination, clock, grants and materialization behavior from migration 161.
BEGIN;

CREATE OR REPLACE FUNCTION private.training_idiom_source_nodes_v1(
    p_user_id uuid, p_direction text, p_list_id uuid,
    p_list_type text, p_training_filter jsonb
)
RETURNS TABLE (
    content_node_id uuid, entry_id uuid, expression_source_path text,
    source_text_fingerprint text, created_at timestamptz, source_revision text
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, private, extensions, pg_temp
AS $$
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
        )
        SELECT * FROM source_nodes;
$$;
REVOKE ALL ON FUNCTION private.training_idiom_source_nodes_v1(uuid,text,uuid,text,jsonb)
    FROM PUBLIC, anon, authenticated, service_role;

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
        WITH source_nodes AS (
            SELECT * FROM private.training_idiom_source_nodes_v1(
                p_user_id, p_direction, p_list_id, p_list_type, p_training_filter
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


-- Session ID is the scope token. Never trust unsaved client-side filter state.
CREATE OR REPLACE FUNCTION public.read_training_idiom_stats_v1(p_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, private, extensions, pg_temp
AS $$
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
      WHERE id = p_session_id AND user_id = v_user_id AND exercise_family = 'idiom';
    IF NOT FOUND THEN RAISE EXCEPTION 'training_session_not_found'; END IF;
    v_direction := split_part(v_session.card_type_ids[1], ':', 2);
    IF v_direction NOT IN ('direct', 'reverse') THEN
        RAISE EXCEPTION 'invalid_idiom_exercise_direction';
    END IF;
    SELECT start_at, end_at INTO v_start, v_end
      FROM private.training_study_day_bounds_v1(
          v_now, private.training_user_timezone_v1(v_user_id)
      );
    RETURN (
        WITH scoped AS MATERIALIZED (
            SELECT node.content_node_id, target.id AS target_id,
                   state.fsrs_enabled, state.next_review_at,
                   state.hidden, state.frozen_until
            FROM private.training_idiom_source_nodes_v1(
                v_user_id, v_direction, v_session.list_id,
                v_session.list_type, v_session.training_filter
            ) node
            LEFT JOIN private.platform_v2_training_exercise_targets target
              ON target.content_node_id = node.content_node_id
             AND target.entry_id = node.entry_id
             AND target.family = 'idiom' AND target.direction = v_direction
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
            'contractVersion', 'training-idiom-stats-v1',
            'newCardsToday', (SELECT count(*) FROM introductions),
            'reviewCardsDone', (SELECT count(*) FROM history
                WHERE NOT is_introduction),
            'reviewCardsDue', (SELECT count(*) FROM scoped
                WHERE fsrs_enabled AND next_review_at < v_end
                  AND NOT COALESCE(hidden, false)
                  AND (frozen_until IS NULL OR frozen_until <= v_now)
                  AND NOT EXISTS (SELECT 1 FROM introductions intro
                                  WHERE intro.target_id = scoped.target_id)),
            'totalCardsStarted', (SELECT count(*) FROM scoped WHERE fsrs_enabled),
            'totalCardsInScope', (SELECT count(*) FROM scoped)
        )
    );
END;
$$;
REVOKE ALL ON FUNCTION public.read_training_idiom_stats_v1(uuid)
    FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.read_training_idiom_stats_v1(uuid) TO authenticated;
COMMENT ON FUNCTION public.read_training_idiom_stats_v1(uuid) IS
  'Read-only study-day idiom statistics in the authenticated owner session scope.';
COMMIT;
