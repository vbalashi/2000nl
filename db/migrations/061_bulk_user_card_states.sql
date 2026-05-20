-- Bulk card-state lookup for external/platform lookup responses.

CREATE OR REPLACE FUNCTION public.get_user_card_states_for_entries(
    p_user_id uuid,
    p_entry_ids uuid[],
    p_card_type_ids text[] DEFAULT NULL
)
RETURNS TABLE (
    entry_id uuid,
    card_type_id text,
    click_count int,
    seen_count int,
    success_count int,
    last_seen_at timestamptz,
    last_reviewed_at timestamptz,
    next_review_at timestamptz,
    hidden boolean,
    frozen_until timestamptz,
    in_learning boolean,
    learning_due_at timestamptz,
    fsrs_stability numeric,
    fsrs_difficulty numeric,
    fsrs_reps int,
    fsrs_lapses int,
    fsrs_last_grade smallint,
    fsrs_last_interval numeric,
    fsrs_params_version text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
BEGIN
    IF (select auth.uid()) IS NULL OR p_user_id IS DISTINCT FROM (select auth.uid()) THEN
        RAISE EXCEPTION 'unauthorized: user_id does not match authenticated user';
    END IF;

    IF p_entry_ids IS NULL OR array_length(p_entry_ids, 1) IS NULL THEN
        RETURN;
    END IF;

    RETURN QUERY
    SELECT
        s.entry_id,
        s.card_type_id,
        s.click_count,
        s.seen_count,
        s.success_count,
        s.last_seen_at,
        s.last_reviewed_at,
        s.next_review_at,
        s.hidden,
        s.frozen_until,
        s.in_learning,
        s.learning_due_at,
        s.fsrs_stability,
        s.fsrs_difficulty,
        s.fsrs_reps,
        s.fsrs_lapses,
        s.fsrs_last_grade,
        s.fsrs_last_interval,
        s.fsrs_params_version
    FROM user_card_status s
    JOIN word_entries w ON w.id = s.entry_id
    WHERE s.user_id = p_user_id
      AND s.entry_id = ANY(p_entry_ids)
      AND (
        p_card_type_ids IS NULL
        OR array_length(p_card_type_ids, 1) IS NULL
        OR s.card_type_id = ANY(p_card_type_ids)
      )
      AND (w.dictionary_id IS NULL OR can_access_dictionary(p_user_id, w.dictionary_id, 'read'));
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_user_card_states_for_entries(uuid, uuid[], text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_user_card_states_for_entries(uuid, uuid[], text[]) TO authenticated;
