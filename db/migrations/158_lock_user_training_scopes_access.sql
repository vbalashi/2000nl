-- Keep per-user Training scope behind the authenticated, owner-checking RPCs.
-- The application has no direct table callers, so client roles receive no
-- direct access and RLS intentionally has no policies. Do not FORCE RLS: the
-- SECURITY DEFINER RPCs are owned by the table owner and use this boundary.
BEGIN;

ALTER TABLE public.user_training_scopes ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE public.user_training_scopes
FROM PUBLIC, anon, authenticated;

-- Column grants are independent of table-level grants and must also be removed.
REVOKE ALL PRIVILEGES (
    user_id,
    language_code,
    active_list_id,
    active_list_type,
    active_scenario,
    card_filter,
    modes_enabled,
    new_review_ratio,
    created_at,
    updated_at
) ON TABLE public.user_training_scopes
FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
