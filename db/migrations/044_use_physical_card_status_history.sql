-- Read recent training history status from physical card-state storage.

CREATE OR REPLACE FUNCTION get_recent_training_history(
    p_user_id uuid,
    p_since timestamptz DEFAULT now() - interval '24 hours',
    p_limit int DEFAULT 50
)
RETURNS TABLE (
    id uuid,
    dictionary_id uuid,
    language_code text,
    headword text,
    part_of_speech text,
    gender text,
    raw jsonb,
    is_nt2_2000 boolean,
    meanings_count int,
    event_type text,
    mode text,
    created_at timestamptz,
    click_count int,
    last_seen_at timestamptz,
    fsrs_last_interval double precision,
    fsrs_reps int,
    fsrs_stability double precision,
    next_review_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
BEGIN
    IF p_user_id != (select auth.uid()) THEN
        RAISE EXCEPTION 'unauthorized: user_id does not match authenticated user';
    END IF;

    RETURN QUERY
    SELECT
        w.id,
        w.dictionary_id,
        w.language_code,
        w.headword,
        w.part_of_speech,
        w.gender,
        CASE
            WHEN jsonb_typeof(w.raw) = 'object'
             AND NOT (w.raw ? 'meaning_id')
             AND w.meaning_id IS NOT NULL
                THEN jsonb_set(w.raw, '{meaning_id}', to_jsonb(w.meaning_id), true)
            ELSE w.raw
        END AS raw,
        w.is_nt2_2000,
        GREATEST((
            SELECT COUNT(*)::int
            FROM word_entries sibling
            WHERE sibling.headword = w.headword
              AND sibling.language_code = w.language_code
              AND (
                    (w.dictionary_id IS NULL AND sibling.dictionary_id IS NULL)
                 OR sibling.dictionary_id = w.dictionary_id
              )
        ), 1) AS meanings_count,
        e.event_type,
        e.mode,
        e.created_at,
        COALESCE(s.click_count, 0) AS click_count,
        COALESCE(s.last_seen_at, e.created_at) AS last_seen_at,
        s.fsrs_last_interval::double precision,
        s.fsrs_reps,
        s.fsrs_stability::double precision,
        s.next_review_at
    FROM user_events e
    JOIN word_entries w ON w.id = e.word_id
    LEFT JOIN user_card_status s
      ON s.user_id = e.user_id
     AND s.entry_id = e.word_id
     AND s.card_type_id = e.mode
    WHERE e.user_id = p_user_id
      AND e.created_at >= COALESCE(p_since, now() - interval '24 hours')
      AND (w.dictionary_id IS NULL OR can_access_dictionary(p_user_id, w.dictionary_id, 'read'))
    ORDER BY e.created_at DESC
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100);
END;
$$;

GRANT EXECUTE ON FUNCTION get_recent_training_history(uuid, timestamptz, int) TO authenticated;
