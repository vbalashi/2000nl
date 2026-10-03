-- p_page_size is the visible page size; lookahead must not affect OFFSET (#481).
BEGIN;

CREATE OR REPLACE FUNCTION public.admin_user_registry_page(
  p_query text DEFAULT NULL,
  p_user_id uuid DEFAULT NULL,
  p_page integer DEFAULT 1,
  p_page_size integer DEFAULT 25
)
RETURNS TABLE (
  user_id uuid,
  email text,
  created_at timestamptz,
  last_sign_in_at timestamptz,
  personal_list_count integer,
  personal_entry_link_count integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_query text := nullif(btrim(p_query), '');
BEGIN
  IF p_page IS NULL OR p_page < 1 OR p_page > 10000
     OR p_page_size IS NULL OR p_page_size < 1 OR p_page_size > 100 THEN
    RAISE EXCEPTION 'invalid_admin_user_page';
  END IF;

  RETURN QUERY
  WITH selected_users AS MATERIALIZED (
    SELECT
      account.id,
      account.email::text,
      account.created_at,
      account.last_sign_in_at
    FROM auth.users AS account
    WHERE (p_user_id IS NULL OR account.id = p_user_id)
      AND NOT EXISTS (
        SELECT 1
        FROM public.admin_operators AS operator_account
        WHERE operator_account.user_id = account.id
           OR operator_account.email = lower(btrim(coalesce(account.email, '')))
      )
      AND (
        v_query IS NULL
        OR strpos(lower(coalesce(account.email, '')), lower(v_query)) > 0
        OR strpos(account.id::text, lower(v_query)) > 0
      )
    ORDER BY account.created_at DESC, account.id ASC
    LIMIT (p_page_size + 1)
    OFFSET (p_page - 1) * p_page_size
  )
  SELECT
    selected.id,
    selected.email,
    selected.created_at,
    selected.last_sign_in_at,
    count(DISTINCT personal_list.id)::integer,
    count(personal_item.word_id)::integer
  FROM selected_users AS selected
  LEFT JOIN public.user_word_lists AS personal_list
    ON personal_list.user_id = selected.id
  LEFT JOIN public.user_word_list_items AS personal_item
    ON personal_item.list_id = personal_list.id
  GROUP BY selected.id, selected.email, selected.created_at, selected.last_sign_in_at
  ORDER BY selected.created_at DESC, selected.id ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_user_registry_page(text, uuid, integer, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_user_registry_page(text, uuid, integer, integer)
  TO service_role;


COMMIT;
