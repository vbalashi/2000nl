-- Move training view tracking behind an explicit RPC.
-- Generated: 2026-05-17

CREATE OR REPLACE FUNCTION record_word_view(
    p_user_id uuid,
    p_word_id uuid,
    p_mode text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    IF p_user_id != (select auth.uid()) THEN
        RAISE EXCEPTION 'unauthorized: user_id does not match authenticated user';
    END IF;

    INSERT INTO user_word_status (user_id, word_id, mode, last_seen_at)
    VALUES (p_user_id, p_word_id, p_mode, now())
    ON CONFLICT (user_id, word_id, mode) DO UPDATE
    SET last_seen_at = excluded.last_seen_at;
END;
$$;

GRANT EXECUTE ON FUNCTION record_word_view(uuid, uuid, text) TO authenticated;
