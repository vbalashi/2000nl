
-- Update get_next_word to include meanings_count
CREATE OR REPLACE FUNCTION get_next_word(
    p_user_id uuid,
    p_mode text,
    p_exclude_ids uuid[] DEFAULT ARRAY[]::uuid[]
)
RETURNS SETOF jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_word_id uuid;
    v_source text;
    v_overdue_count int;
BEGIN
    -- 0. Calculate Debug Stats
    SELECT count(*) INTO v_overdue_count
    FROM user_word_status s
    JOIN word_entries w ON w.id = s.word_id
    WHERE s.user_id = p_user_id 
      AND s.mode = p_mode
      AND s.next_review_at <= now()
      AND (s.frozen_until IS NULL OR s.frozen_until <= now())
      AND s.hidden = false
      AND w.is_nt2_2000 = true;

    -- Priority 1: Overdue reviews
    SELECT s.word_id, 'review' INTO v_word_id, v_source
    FROM user_word_status s
    JOIN word_entries w ON w.id = s.word_id
    WHERE s.user_id = p_user_id 
      AND s.mode = p_mode
      AND s.next_review_at <= now()
      AND (s.frozen_until IS NULL OR s.frozen_until <= now())
      AND s.hidden = false
      AND w.is_nt2_2000 = true
      AND NOT (s.word_id = ANY(p_exclude_ids))
    ORDER BY s.next_review_at ASC
    LIMIT 1;

    -- Priority 2: New words
    IF v_word_id IS NULL THEN
        SELECT id, 'new' INTO v_word_id, v_source
        FROM word_entries w
        WHERE w.is_nt2_2000 = true
          AND NOT EXISTS (
              SELECT 1 FROM user_word_status s 
              WHERE s.word_id = w.id 
                AND s.user_id = p_user_id 
                AND s.mode = p_mode
          )
          AND NOT (w.id = ANY(p_exclude_ids))
        ORDER BY random()
        LIMIT 1;
    END IF;

    -- Return joined data
    IF v_word_id IS NOT NULL THEN
        RETURN QUERY
        SELECT jsonb_build_object(
            'id', w.id,
            'headword', w.headword,
            'part_of_speech', w.part_of_speech,
            'gender', w.gender,
            'raw', w.raw,
            'vandaleId', w.vandale_id,
            'is_nt2_2000', w.is_nt2_2000,
            'meanings_count', (SELECT count(*) FROM word_entries sub WHERE sub.headword = w.headword), -- Added count
            'stats', jsonb_build_object(
                'source', v_source,
                'next_review', s.next_review_at,
                'interval', s.sm2_interval,
                'reps', s.sm2_n,
                'ef', s.sm2_ef,
                'clicks', s.click_count,
                'overdue_count', v_overdue_count,
                'reason', v_source
            )
        )
        FROM word_entries w
        LEFT JOIN user_word_status s ON s.word_id = w.id AND s.user_id = p_user_id AND s.mode = p_mode
        WHERE w.id = v_word_id;
    END IF;
    
    RETURN;
END;
$$;
