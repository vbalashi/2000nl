-- A Library page can contain 25 groups × 50 meanings. Keep one indexed state
-- read, rather than invoking the single-Entry RPC separately for each meaning.
BEGIN;
CREATE OR REPLACE FUNCTION public.get_meanings_learning_progress_v1(p_entry_ids uuid[])
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, private, extensions, pg_temp
AS $$
DECLARE
    v_user_id uuid := auth.uid();
    v_result jsonb;
BEGIN
    IF v_user_id IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
    IF p_entry_ids IS NULL OR cardinality(p_entry_ids) > 1250 THEN
        RAISE EXCEPTION 'meaning_progress_limit';
    END IF;
    IF EXISTS (
        SELECT 1 FROM unnest(p_entry_ids) target(id)
        LEFT JOIN public.word_entries entry ON entry.id = target.id
        WHERE entry.id IS NULL OR (
            entry.dictionary_id IS NOT NULL
            AND NOT public.can_access_dictionary(v_user_id, entry.dictionary_id, 'read')
        )
    ) THEN RAISE EXCEPTION 'meaning_unavailable'; END IF;

    WITH states AS MATERIALIZED (
        SELECT * FROM public.get_platform_v2_card_states_for_entries(
            v_user_id, p_entry_ids,
            ARRAY['word-to-definition','definition-to-word']::text[]
        )
    ), snapshots AS (
        SELECT entry.id, jsonb_build_object(
            'entryId', entry.id,
            'headword', entry.headword,
            'exclusionId', exclusion.id,
            'directions', jsonb_agg(jsonb_build_object(
                'cardTypeId', state.card_type_id,
                'stateRevision', COALESCE(state.state_revision::text, 'untracked'),
                'knownMarkId', state.known_mark_id,
                'knownMarkRevision', state.known_mark_revision,
                'knownMarkedAt', state.known_marked_at,
                'phase', CASE
                    WHEN state.hidden THEN 'hidden'
                    WHEN state.frozen_until > private.training_reference_now_v1() THEN 'frozen'
                    WHEN state.in_learning THEN 'learning'
                    WHEN state.fsrs_reps > 0 OR state.last_reviewed_at IS NOT NULL THEN 'reviewing'
                    ELSE 'new'
                END,
                'presentations', COALESCE(state.seen_count, 0),
                'gradedAttempts', COALESCE(state.fsrs_reps, 0),
                'lastGrade', state.fsrs_last_grade,
                'lastReviewedAt', state.last_reviewed_at,
                'nextReviewAt', COALESCE(state.learning_due_at, state.next_review_at),
                'stability', state.fsrs_stability,
                'difficulty', state.fsrs_difficulty
            ) ORDER BY state.card_type_id DESC)
        ) value
        FROM states state
        JOIN public.word_entries entry ON entry.id = state.entry_id
        LEFT JOIN private.training_headword_exclusions exclusion
            ON exclusion.user_id = v_user_id AND exclusion.entry_id = entry.id
            AND exclusion.restored_at IS NULL
        GROUP BY entry.id, entry.headword, exclusion.id
    )
    SELECT COALESCE(jsonb_agg(
        value || jsonb_build_object('revision', encode(digest(value::text, 'sha256'), 'hex'))
        ORDER BY id
    ), '[]'::jsonb) INTO v_result FROM snapshots;
    RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION public.get_meanings_learning_progress_v1(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_meanings_learning_progress_v1(uuid[]) TO authenticated, service_role;

-- Single-Entry and Library batch reads share exactly the same projection.
CREATE OR REPLACE FUNCTION public.get_meaning_learning_progress_v1(p_entry_id uuid)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
    SELECT public.get_meanings_learning_progress_v1(ARRAY[p_entry_id]) -> 0;
$$;
REVOKE ALL ON FUNCTION public.get_meaning_learning_progress_v1(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_meaning_learning_progress_v1(uuid) TO authenticated, service_role;
COMMIT;
