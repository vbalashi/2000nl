-- Keep generated user-entry validation as an internal helper. Migration 085
-- replaces the function and grants it to authenticated users, so re-apply the
-- hardening invariant expected by local_supabase_probe.sql.

REVOKE EXECUTE ON FUNCTION validate_user_entry_v1_payload(jsonb, text) FROM PUBLIC, anon, authenticated;
