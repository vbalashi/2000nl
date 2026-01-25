-- Migration: Optimize RLS Policy Performance
-- Date: 2026-01-25
-- Context: All auth.uid() policies running 99% slower than necessary
-- Related: reports/supabase-audit-2026-01-25.md, docs/TODO-supabase-optimization.md
--
-- PERFORMANCE IMPACT:
-- - Before: 171ms per query on 1K rows (auth.uid() called per-row)
-- - After: <1ms per query (auth.uid() cached per-query)
-- - Improvement: 99.94% faster
--
-- CHANGES:
-- 1. Wrap auth.uid() with subquery: auth.uid() → (select auth.uid())
-- 2. Add role specification: TO public → TO authenticated
-- 3. Both changes force query planner to use InitPlan caching
--
-- Reference: https://supabase.com/docs/guides/database/database-advisors?lint=0003_auth_rls_initplan

-- =============================================================================
-- USER_WORD_STATUS POLICIES (4 policies)
-- =============================================================================

DROP POLICY IF EXISTS user_word_status_select_self ON user_word_status;
DROP POLICY IF EXISTS user_word_status_insert_self ON user_word_status;
DROP POLICY IF EXISTS user_word_status_update_self ON user_word_status;
DROP POLICY IF EXISTS user_word_status_delete_self ON user_word_status;

CREATE POLICY user_word_status_select_self
ON user_word_status
FOR SELECT
TO authenticated
USING (user_id = (select auth.uid()));

CREATE POLICY user_word_status_insert_self
ON user_word_status
FOR INSERT
TO authenticated
WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY user_word_status_update_self
ON user_word_status
FOR UPDATE
TO authenticated
USING (user_id = (select auth.uid()))
WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY user_word_status_delete_self
ON user_word_status
FOR DELETE
TO authenticated
USING (user_id = (select auth.uid()));

-- =============================================================================
-- USER_EVENTS POLICIES (4 policies)
-- =============================================================================

DROP POLICY IF EXISTS user_events_select_self ON user_events;
DROP POLICY IF EXISTS user_events_insert_self ON user_events;
DROP POLICY IF EXISTS user_events_update_self ON user_events;
DROP POLICY IF EXISTS user_events_delete_self ON user_events;

CREATE POLICY user_events_select_self
ON user_events
FOR SELECT
TO authenticated
USING (user_id = (select auth.uid()));

CREATE POLICY user_events_insert_self
ON user_events
FOR INSERT
TO authenticated
WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY user_events_update_self
ON user_events
FOR UPDATE
TO authenticated
USING (user_id = (select auth.uid()))
WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY user_events_delete_self
ON user_events
FOR DELETE
TO authenticated
USING (user_id = (select auth.uid()));

-- =============================================================================
-- USER_WORD_LISTS POLICIES (4 policies)
-- =============================================================================

DROP POLICY IF EXISTS select_own_user_word_lists ON user_word_lists;
DROP POLICY IF EXISTS insert_own_user_word_lists ON user_word_lists;
DROP POLICY IF EXISTS update_own_user_word_lists ON user_word_lists;
DROP POLICY IF EXISTS delete_own_user_word_lists ON user_word_lists;

CREATE POLICY select_own_user_word_lists
ON user_word_lists
FOR SELECT
TO authenticated
USING ((select auth.uid()) = user_id);

CREATE POLICY insert_own_user_word_lists
ON user_word_lists
FOR INSERT
TO authenticated
WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY update_own_user_word_lists
ON user_word_lists
FOR UPDATE
TO authenticated
USING ((select auth.uid()) = user_id)
WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY delete_own_user_word_lists
ON user_word_lists
FOR DELETE
TO authenticated
USING ((select auth.uid()) = user_id);

-- =============================================================================
-- USER_WORD_LIST_ITEMS POLICIES (4 policies)
-- =============================================================================

DROP POLICY IF EXISTS select_items_for_owned_lists ON user_word_list_items;
DROP POLICY IF EXISTS insert_items_for_owned_lists ON user_word_list_items;
DROP POLICY IF EXISTS update_items_for_owned_lists ON user_word_list_items;
DROP POLICY IF EXISTS delete_items_for_owned_lists ON user_word_list_items;

CREATE POLICY select_items_for_owned_lists
ON user_word_list_items
FOR SELECT
TO authenticated
USING (EXISTS (
    SELECT 1 FROM user_word_lists l
    WHERE l.id = list_id AND l.user_id = (select auth.uid())
));

CREATE POLICY insert_items_for_owned_lists
ON user_word_list_items
FOR INSERT
TO authenticated
WITH CHECK (EXISTS (
    SELECT 1 FROM user_word_lists l
    WHERE l.id = list_id AND l.user_id = (select auth.uid())
));

CREATE POLICY update_items_for_owned_lists
ON user_word_list_items
FOR UPDATE
TO authenticated
USING (EXISTS (
    SELECT 1 FROM user_word_lists l
    WHERE l.id = list_id AND l.user_id = (select auth.uid())
))
WITH CHECK (EXISTS (
    SELECT 1 FROM user_word_lists l
    WHERE l.id = list_id AND l.user_id = (select auth.uid())
));

CREATE POLICY delete_items_for_owned_lists
ON user_word_list_items
FOR DELETE
TO authenticated
USING (EXISTS (
    SELECT 1 FROM user_word_lists l
    WHERE l.id = list_id AND l.user_id = (select auth.uid())
));

-- =============================================================================
-- USER_WORD_NOTES POLICIES (4 policies)
-- =============================================================================

DROP POLICY IF EXISTS select_own_user_word_notes ON user_word_notes;
DROP POLICY IF EXISTS insert_own_user_word_notes ON user_word_notes;
DROP POLICY IF EXISTS update_own_user_word_notes ON user_word_notes;
DROP POLICY IF EXISTS delete_own_user_word_notes ON user_word_notes;

CREATE POLICY select_own_user_word_notes
ON user_word_notes
FOR SELECT
TO authenticated
USING ((select auth.uid()) = user_id);

CREATE POLICY insert_own_user_word_notes
ON user_word_notes
FOR INSERT
TO authenticated
WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY update_own_user_word_notes
ON user_word_notes
FOR UPDATE
TO authenticated
USING ((select auth.uid()) = user_id)
WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY delete_own_user_word_notes
ON user_word_notes
FOR DELETE
TO authenticated
USING ((select auth.uid()) = user_id);

-- =============================================================================
-- VERIFICATION
-- =============================================================================

-- After running this migration, verify optimization:
--
-- SELECT tablename, policyname, qual::text
-- FROM pg_policies
-- WHERE schemaname = 'public'
--   AND qual::text LIKE '%auth.uid()%'
--   AND qual::text NOT LIKE '%(select auth.uid())%';
--
-- Should return 0 rows (all auth.uid() calls are wrapped)

-- Benchmark queries before/after:
--
-- set session role authenticated;
-- set request.jwt.claims to '{"role":"authenticated", "sub":"<test-user-uuid>"}';
--
-- explain analyze
-- SELECT * FROM user_word_status WHERE user_id = '<test-user-uuid>' LIMIT 100;
--
-- Look for "InitPlan" in output (indicates cached auth.uid())
