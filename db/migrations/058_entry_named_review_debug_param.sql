-- Keep the private optional FSRS debug helper aligned with entry terminology.

DROP FUNCTION IF EXISTS private.get_last_review_debug(uuid, uuid, text);

CREATE OR REPLACE FUNCTION private.get_last_review_debug(
    p_user_id uuid,
    p_entry_id uuid,
    p_mode text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
    v_row user_review_log%rowtype;
BEGIN
    IF p_user_id != (select auth.uid()) THEN
        RAISE EXCEPTION 'unauthorized: user_id does not match authenticated user';
    END IF;

    SELECT *
    INTO v_row
    FROM user_review_log
    WHERE user_id = p_user_id
      AND word_id = p_entry_id
      AND mode = p_mode
    ORDER BY reviewed_at DESC
    LIMIT 1;

    IF v_row.id IS NULL THEN
        RETURN NULL;
    END IF;

    RETURN jsonb_build_object(
        'reviewed_at', v_row.reviewed_at,
        'scheduled_at', v_row.scheduled_at,
        'review_type', v_row.review_type,
        'grade', v_row.grade,
        'interval_after', v_row.interval_after,
        'stability_before', v_row.stability_before,
        'stability_after', v_row.stability_after,
        'metadata', v_row.metadata
    );
END;
$$;
