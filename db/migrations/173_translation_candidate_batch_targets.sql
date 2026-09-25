-- Build sentence candidates and ensure their exercise targets in one set-based
-- statement. Existing, unchanged targets are no longer locked and rewritten
-- once per requested card during every session start.
BEGIN;

CREATE OR REPLACE FUNCTION private.platform_v2_translation_exercise_candidates_v2(
  p_user_id uuid,
  p_limit integer,
  p_offset integer,
  p_list_id uuid,
  p_list_type text,
  p_card_filter text,
  p_training_filter jsonb
)
RETURNS SETOF jsonb
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = public, private, extensions, pg_temp
AS $function$
  WITH source_nodes AS MATERIALIZED (
    SELECT *
      FROM private.training_translation_source_nodes_v1(
        p_user_id, p_list_id, p_list_type, p_training_filter
      )
  ), shaped AS (
    SELECT source_nodes.*,
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
             WHEN state.next_review_at <= private.training_reference_now_v1() THEN 2
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
    SELECT shaped.*,
           row_number() OVER (
             PARTITION BY CASE WHEN queue_rank = 0 THEN 0 ELSE 1 END
             ORDER BY queue_rank, next_review_at NULLS FIRST,
                      created_at, content_node_id
           ) AS queue_ordinal
      FROM shaped
     WHERE COALESCE(hidden, false) = false
       AND NOT EXISTS (
         SELECT 1
           FROM private.training_pair_exclusions AS exclusion
          WHERE exclusion.user_id = p_user_id
            AND exclusion.restored_at IS NULL
            AND exclusion.pair_key = private.training_pair_key_v1(
              'translation', shaped.entry_id, shaped.content_node_id,
              shaped.source_text_fingerprint, NULL
            )
       )
       AND (frozen_until IS NULL
            OR frozen_until <= private.training_reference_now_v1())
       AND (
         (p_card_filter IN ('both', 'new') AND queue_rank = 0)
         OR (p_card_filter IN ('both', 'review') AND queue_rank IN (1, 2))
       )
  ), selected AS MATERIALIZED (
    SELECT *
      FROM ranked
     WHERE queue_ordinal > GREATEST(COALESCE(p_offset, 0), 0)
       AND queue_ordinal <= GREATEST(COALESCE(p_offset, 0), 0)::bigint
         + LEAST(GREATEST(COALESCE(p_limit, 20), 1), 1000)
     ORDER BY queue_rank, next_review_at NULLS FIRST,
              created_at, content_node_id
  ), ensured AS (
    INSERT INTO private.platform_v2_training_exercise_targets (
      entry_id, content_node_id, family, direction,
      source_revision, source_text_fingerprint
    )
    SELECT entry_id, content_node_id, 'translation', 'recall',
           source_revision, source_text_fingerprint
      FROM selected
    ON CONFLICT (entry_id, content_node_id, family, direction)
    DO UPDATE
       SET source_revision = EXCLUDED.source_revision,
           visibility_state = 'active',
           retired_at = NULL,
           retirement_reason = NULL,
           updated_at = private.training_reference_now_v1()
     WHERE platform_v2_training_exercise_targets.source_text_fingerprint
             = EXCLUDED.source_text_fingerprint
       AND (
         platform_v2_training_exercise_targets.source_revision
           IS DISTINCT FROM EXCLUDED.source_revision
         OR platform_v2_training_exercise_targets.visibility_state <> 'active'
         OR platform_v2_training_exercise_targets.retired_at IS NOT NULL
         OR platform_v2_training_exercise_targets.retirement_reason IS NOT NULL
       )
    RETURNING id, entry_id, content_node_id, target_key
  ), target_rows AS MATERIALIZED (
    SELECT target.id, target.entry_id, target.content_node_id,
           target.target_key
      FROM private.platform_v2_training_exercise_targets AS target
      JOIN selected
        ON selected.entry_id = target.entry_id
       AND selected.content_node_id = target.content_node_id
     WHERE target.family = 'translation'
       AND target.direction = 'recall'
    UNION
    SELECT id, entry_id, content_node_id, target_key
      FROM ensured
  )
  SELECT jsonb_build_object(
           'targetId', target.id,
           'targetKey', target.target_key,
           'family', 'translation',
           'direction', 'recall',
           'entryId', selected.entry_id,
           'contentNodeId', selected.content_node_id,
           'sourcePath', selected.source_path,
           'sourceRevision', selected.source_revision,
           'sourceTextFingerprint', selected.source_text_fingerprint,
           'queueSource', CASE
             WHEN selected.target_id IS NULL THEN 'new'
             WHEN COALESCE(selected.fsrs_enabled, false) = false THEN 'new'
             WHEN selected.next_review_at <= private.training_reference_now_v1()
               AND COALESCE(selected.fsrs_last_interval, 0) < 1 THEN 'learning'
             WHEN selected.next_review_at <= private.training_reference_now_v1()
               THEN 'review'
             ELSE 'practice'
           END,
           'state', CASE
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
         )
    FROM selected
    JOIN target_rows AS target
      ON target.entry_id = selected.entry_id
     AND target.content_node_id = selected.content_node_id
    LEFT JOIN public.user_training_exercise_state AS state
      ON state.user_id = p_user_id
     AND state.target_id = target.id
   ORDER BY selected.queue_rank, selected.next_review_at NULLS FIRST,
            selected.created_at, selected.content_node_id;
$function$;

ALTER FUNCTION private.platform_v2_translation_exercise_candidates_v2(
  uuid, integer, integer, uuid, text, text, jsonb
) OWNER TO postgres;
REVOKE ALL ON FUNCTION private.platform_v2_translation_exercise_candidates_v2(
  uuid, integer, integer, uuid, text, text, jsonb
) FROM PUBLIC, anon, authenticated, service_role;

COMMIT;
