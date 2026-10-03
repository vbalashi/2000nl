-- Bounded, read-only account facts for the operator user registry (#481).
-- Never expose subscription_tier as proof of payment or an active grant.

BEGIN;

ALTER TABLE public.admin_operators
  DROP CONSTRAINT IF EXISTS admin_operators_permissions_allowed;
ALTER TABLE public.admin_operators
  ADD CONSTRAINT admin_operators_permissions_allowed
  CHECK (permissions <@ ARRAY[
    'dictionaries.read',
    'audit.read',
    'publication.manage',
    'dictionary.content.read',
    'users.read'
  ]::text[]);

ALTER TABLE public.admin_audit_events
  DROP CONSTRAINT IF EXISTS admin_audit_events_action_allowed;
ALTER TABLE public.admin_audit_events
  ADD CONSTRAINT admin_audit_events_action_allowed CHECK (action IN (
    'auth.sign_in', 'auth.sign_in_denied', 'auth.sign_out', 'access.denied',
    'dictionary.registry.read', 'dictionary.metadata.read', 'dictionary.content.read',
    'dictionary.publication.updated', 'dictionary.audience.updated', 'audit.journal.read',
    'user.registry.read', 'user.profile.read'
  ));

CREATE OR REPLACE FUNCTION public.admin_user_registry_page(
  p_query text DEFAULT NULL,
  p_user_id uuid DEFAULT NULL,
  p_page integer DEFAULT 1,
  p_page_size integer DEFAULT 26
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
     OR p_page_size IS NULL OR p_page_size < 1 OR p_page_size > 101 THEN
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
    LIMIT p_page_size
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
