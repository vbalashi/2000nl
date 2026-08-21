-- Browser-safe recent Training history projection.
-- Identity and the 24-hour boundary are deliberately server-owned: callers
-- can choose only a smaller display limit, never another principal or window.

BEGIN;

CREATE OR REPLACE FUNCTION public.get_recent_training_review_history(
    p_limit integer DEFAULT 50
)
RETURNS TABLE(
    entry_id uuid,
    headword text,
    part_of_speech text,
    review_result text,
    card_type_id text,
    reviewed_at timestamptz,
    has_more boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
    v_user_id uuid := (select auth.uid());
    v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 50);
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'unauthorized: authenticated user required';
    END IF;

    RETURN QUERY
    WITH bounded AS MATERIALIZED (
        SELECT
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
            rl.id AS review_id
        FROM public.user_review_log rl
        JOIN public.word_entries w ON w.id = rl.word_id
        WHERE rl.user_id = v_user_id
          AND rl.reviewed_at >= pg_catalog.now() - interval '24 hours'
          AND rl.grade BETWEEN 1 AND 4
          AND (
              w.dictionary_id IS NULL
              OR public.can_access_dictionary(v_user_id, w.dictionary_id, 'read')
          )
        ORDER BY rl.reviewed_at DESC, rl.id DESC
        LIMIT v_limit + 1
    ), projection AS (
        SELECT (pg_catalog.count(*) > v_limit) AS has_more
        FROM bounded
    )
    SELECT
        b.entry_id,
        b.headword,
        b.part_of_speech,
        b.review_result,
        b.card_type_id,
        b.reviewed_at,
        p.has_more
    FROM bounded b
    CROSS JOIN projection p
    ORDER BY b.reviewed_at DESC, b.review_id DESC
    LIMIT v_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.get_recent_training_review_history(integer)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_recent_training_review_history(integer)
TO authenticated;

COMMENT ON FUNCTION public.get_recent_training_review_history(integer) IS
'Authenticated display-only projection of the latest 50 review records from the server-owned trailing 24-hour window.';

COMMIT;
