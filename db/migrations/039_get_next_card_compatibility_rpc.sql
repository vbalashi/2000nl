-- Card-oriented scheduler compatibility wrapper.
-- The current scheduler implementation still lives in get_next_word; this RPC
-- exposes entry/card terminology for new clients while preserving behavior.

CREATE OR REPLACE FUNCTION get_next_card(
    p_user_id uuid,
    p_card_type_ids text[] DEFAULT ARRAY['word-to-definition'],
    p_exclude_entry_ids uuid[] DEFAULT ARRAY[]::uuid[],
    p_list_id uuid DEFAULT NULL,
    p_list_type text DEFAULT 'curated',
    p_card_filter text DEFAULT 'both',
    p_queue_turn text DEFAULT 'auto',
    p_exclude_card_keys text[] DEFAULT ARRAY[]::text[]
)
RETURNS SETOF jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT item
    FROM get_next_word(
        p_user_id,
        p_card_type_ids,
        p_exclude_entry_ids,
        p_list_id,
        p_list_type,
        p_card_filter,
        p_queue_turn,
        p_exclude_card_keys
    ) AS item;
$$;

GRANT EXECUTE ON FUNCTION get_next_card(uuid, text[], uuid[], uuid, text, text, text, text[]) TO authenticated;
