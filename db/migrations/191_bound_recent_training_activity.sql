-- Bound each history stream before the global latest-action merge.
-- Migration 190 remains immutable: this replaces its exact function signature.
BEGIN;
CREATE INDEX IF NOT EXISTS training_word_review_recent_activity_idx
ON public.user_review_log (user_id, reviewed_at DESC, id DESC)
WHERE grade BETWEEN 1 AND 4;
CREATE INDEX IF NOT EXISTS training_word_start_recent_activity_idx
ON public.user_card_action_events (user_id, created_at DESC, id DESC)
WHERE action = 'start-learning';

CREATE OR REPLACE FUNCTION public.get_recent_training_activity_v1(
    p_limit integer DEFAULT 50
)
RETURNS TABLE(
    activity_id text,
    entry_id uuid,
    headword text,
    part_of_speech text,
    review_result text,
    card_type_id text,
    exercise_family text,
    exercise_direction text,
    target_id uuid,
    exercise_text text,
    reviewed_at timestamptz,
    has_more boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
    v_user_id uuid := (select auth.uid());
    v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 50);
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'unauthorized: authenticated user required';
    END IF;

    RETURN QUERY
    WITH activity AS MATERIALIZED (
        (SELECT
            w.id AS entry_id,
            w.headword,
            w.part_of_speech,
            'learning_started'::text AS review_result,
            e.card_type_id,
            e.created_at AS reviewed_at,
            'word-start:' || e.id::text AS activity_id,
            'meaning'::text AS exercise_family, NULL::text AS exercise_direction,
            NULL::uuid AS target_id, NULL::text AS exercise_text
        FROM public.user_card_action_events e
        JOIN public.word_entries w ON w.id = e.entry_id
        WHERE e.user_id = v_user_id
          AND e.action = 'start-learning'
          AND (
              w.dictionary_id IS NULL
              OR public.can_access_dictionary(v_user_id, w.dictionary_id, 'read')
          )
        ORDER BY e.created_at DESC, e.id DESC LIMIT v_limit + 1)
        UNION ALL
        (SELECT
            w.id AS entry_id,
            w.headword,
            w.part_of_speech,
            CASE rl.grade
                WHEN 1 THEN 'review_fail'
                WHEN 2 THEN 'review_hard'
                WHEN 3 THEN 'review_success'
                WHEN 4 THEN 'review_easy'
            END AS review_result,
            rl.mode AS card_type_id,
            rl.reviewed_at,
            'word-review:' || rl.id::text AS activity_id,
            'meaning'::text AS exercise_family, NULL::text AS exercise_direction,
            NULL::uuid AS target_id, NULL::text AS exercise_text
        FROM public.user_review_log rl
        JOIN public.word_entries w ON w.id = rl.word_id
        WHERE rl.user_id = v_user_id
          AND rl.grade BETWEEN 1 AND 4
          AND (
              w.dictionary_id IS NULL
              OR public.can_access_dictionary(v_user_id, w.dictionary_id, 'read')
          )
        ORDER BY rl.reviewed_at DESC, rl.id DESC LIMIT v_limit + 1)
        UNION ALL
        (SELECT w.id, w.headword, w.part_of_speech,
            CASE e.result WHEN 'fail' THEN 'review_fail' WHEN 'hard' THEN 'review_hard'
                WHEN 'success' THEN 'review_success' WHEN 'easy' THEN 'review_easy' END,
            NULL::text, e.created_at, 'exercise-review:' || e.id::text,
            t.family, t.direction, t.id,
            CASE WHEN n.source_text_fingerprint = t.source_text_fingerprint
                THEN NULLIF(btrim(n.canonical_source_text), '') END
        FROM public.user_training_exercise_action_events e
        JOIN private.platform_v2_training_exercise_targets t ON t.id = e.target_id
        JOIN public.word_entries w ON w.id = t.entry_id
        LEFT JOIN private.platform_v2_content_nodes n ON n.id = t.content_node_id
        WHERE e.user_id = v_user_id
          AND e.action = 'review-exercise'
          AND e.result IN ('fail', 'hard', 'success', 'easy')
          AND t.family IN ('idiom', 'translation')
          AND (w.dictionary_id IS NULL
              OR public.can_access_dictionary(v_user_id, w.dictionary_id, 'read'))
        ORDER BY e.created_at DESC, e.id DESC LIMIT v_limit + 1)
    ), bounded AS MATERIALIZED (
        SELECT *
        FROM activity a
        ORDER BY a.reviewed_at DESC, a.activity_id DESC
        LIMIT v_limit + 1
    ), projection AS (
        SELECT (pg_catalog.count(*) > v_limit) AS has_more
        FROM bounded
    )
    SELECT
        b.activity_id,
        b.entry_id,
        b.headword,
        b.part_of_speech,
        b.review_result,
        b.card_type_id,
        b.exercise_family,
        b.exercise_direction,
        b.target_id,
        b.exercise_text,
        b.reviewed_at,
        p.has_more
    FROM bounded b
    CROSS JOIN projection p
    ORDER BY b.reviewed_at DESC, b.activity_id DESC
    LIMIT v_limit;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_recent_training_activity_v1(integer) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.get_recent_training_activity_v1(integer) TO authenticated;
COMMENT ON FUNCTION public.get_recent_training_activity_v1(integer) IS
'Authenticated latest 50-action read projection of word and exercise history. No raw source context; stale node text is withheld; legacy history RPC remains available.';
COMMIT;
