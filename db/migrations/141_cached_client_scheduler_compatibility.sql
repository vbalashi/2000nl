-- Preserve the immediately preceding public RPC shapes while browser caches
-- can still run the pre-132 client. These are forwarding adapters only: v2
-- remains the sole scheduler implementation and stale clients cannot opt into
-- future-practice cards that they do not understand.

BEGIN;

CREATE OR REPLACE FUNCTION public.get_next_card(
  p_user_id uuid,
  p_card_type_ids text[],
  p_exclude_entry_ids uuid[],
  p_list_id uuid,
  p_list_type text,
  p_card_filter text,
  p_queue_turn text,
  p_exclude_card_keys text[]
)
RETURNS SETOF jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
BEGIN
  RETURN QUERY
  SELECT * FROM public.get_next_card(
    p_user_id,
    p_card_type_ids,
    p_exclude_entry_ids,
    p_list_id,
    p_list_type,
    p_card_filter,
    p_queue_turn,
    p_exclude_card_keys,
    false
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_next_filtered_card(
  p_user_id uuid,
  p_card_type_ids text[],
  p_exclude_entry_ids uuid[],
  p_list_id uuid,
  p_list_type text,
  p_card_filter text,
  p_queue_turn text,
  p_exclude_card_keys text[],
  p_training_filter jsonb
)
RETURNS SETOF jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
BEGIN
  RETURN QUERY
  SELECT * FROM public.get_next_filtered_card(
    p_user_id,
    p_card_type_ids,
    p_exclude_entry_ids,
    p_list_id,
    p_list_type,
    p_card_filter,
    p_queue_turn,
    p_exclude_card_keys,
    p_training_filter,
    false
  );
END;
$$;

ALTER FUNCTION public.get_next_card(
  uuid,text[],uuid[],uuid,text,text,text,text[]
) OWNER TO postgres;
ALTER FUNCTION public.get_next_filtered_card(
  uuid,text[],uuid[],uuid,text,text,text,text[],jsonb
) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.get_next_card(
  uuid,text[],uuid[],uuid,text,text,text,text[]
) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_next_filtered_card(
  uuid,text[],uuid[],uuid,text,text,text,text[],jsonb
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_next_card(
  uuid,text[],uuid[],uuid,text,text,text,text[]
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_next_filtered_card(
  uuid,text[],uuid[],uuid,text,text,text,text[],jsonb
) TO authenticated;

COMMIT;
