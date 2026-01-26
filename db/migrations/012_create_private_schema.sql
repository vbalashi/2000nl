-- Migration: Create private schema and move internal functions
-- Date: 2026-01-25
-- Context: Separate internal/debug functions from public API
-- Related: reports/security-definer-audit.md
--
-- PURPOSE: Create a 'private' schema for internal functions that should
-- NOT be exposed via PostgREST API. Functions in 'public' schema are
-- automatically exposed at /rest/v1/rpc/<function_name>.
--
-- Functions moved to private:
--   - get_last_review_debug (debug/diagnostic function)

-- =============================================================================
-- CREATE PRIVATE SCHEMA
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS private;

-- Revoke all permissions from public roles
REVOKE ALL ON SCHEMA private FROM public, anon, authenticated;

-- Grant usage only to postgres role (superuser/owner)
GRANT USAGE ON SCHEMA private TO postgres;

-- Allow postgres to create objects in private schema
GRANT CREATE ON SCHEMA private TO postgres;

-- =============================================================================
-- MOVE get_last_review_debug TO PRIVATE SCHEMA
-- =============================================================================

-- Create in private schema
CREATE OR REPLACE FUNCTION private.get_last_review_debug(
    p_user_id uuid,
    p_word_id uuid,
    p_mode text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
    v_row user_review_log%rowtype;
BEGIN
    -- AUTH CHECK: Verify caller owns this user_id
    IF p_user_id != (select auth.uid()) THEN
        RAISE EXCEPTION 'unauthorized: user_id does not match authenticated user';
    END IF;

    SELECT *
    INTO v_row
    FROM user_review_log
    WHERE user_id = p_user_id
      AND word_id = p_word_id
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
        'stability_before', v_row.stability_before,
        'difficulty_before', v_row.difficulty_before,
        'stability_after', v_row.stability_after,
        'difficulty_after', v_row.difficulty_after,
        'interval_after', v_row.interval_after,
        'params_version', v_row.params_version,
        'metadata', v_row.metadata
    );
END;
$$;

-- Drop from public schema (if it exists)
DROP FUNCTION IF EXISTS public.get_last_review_debug(uuid, uuid, text);

-- =============================================================================
-- NOTES
-- =============================================================================

-- Private schema functions:
-- - NOT accessible via PostgREST API
-- - Can be called by other functions via: SELECT * FROM private.my_function(...)
-- - Useful for: internal helpers, debug functions, migrations, testing

-- Public schema functions:
-- - Accessible via POST /rest/v1/rpc/<function_name>
-- - Must have proper auth checks
-- - Should be documented in docs/api-functions.md

-- To call private functions from SQL:
--   SELECT * FROM private.get_last_review_debug(auth.uid(), '<word-uuid>', 'word-to-definition');

-- To verify function is in private schema:
--   SELECT n.nspname as schema, p.proname as function
--   FROM pg_proc p
--   JOIN pg_namespace n ON n.oid = p.pronamespace
--   WHERE p.proname = 'get_last_review_debug';

-- =============================================================================
-- VERIFICATION
-- =============================================================================

-- Check schema exists and permissions are correct:
-- SELECT schema_name FROM information_schema.schemata WHERE schema_name = 'private';
--
-- Check function is in private schema:
-- SELECT routine_schema, routine_name FROM information_schema.routines
-- WHERE routine_name = 'get_last_review_debug';
--
-- Try calling via PostgREST (should fail - not in public schema):
-- POST /rest/v1/rpc/get_last_review_debug
-- Expected: 404 Not Found
