-- Migration: Enable RLS and add policies for user_review_log and user_settings
-- Date: 2026-01-25
-- Context: Tables had RLS disabled despite migration 005 attempting to enable it
-- Security Impact: HIGH - These tables contain user data and were accessible without auth
--
-- user_review_log: 1476 rows of user review history
-- user_settings: 6 rows of user preferences
--
-- Both tables have user_id columns and should enforce user isolation

-- =============================================================================
-- ENABLE RLS
-- =============================================================================

ALTER TABLE user_review_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- USER_REVIEW_LOG POLICIES
-- =============================================================================
-- Optimized pattern: (select auth.uid()) and TO authenticated

DROP POLICY IF EXISTS user_review_log_select_self ON user_review_log;
DROP POLICY IF EXISTS user_review_log_insert_self ON user_review_log;
DROP POLICY IF EXISTS user_review_log_update_self ON user_review_log;
DROP POLICY IF EXISTS user_review_log_delete_self ON user_review_log;

CREATE POLICY user_review_log_select_self
ON user_review_log
FOR SELECT
TO authenticated
USING (user_id = (select auth.uid()));

CREATE POLICY user_review_log_insert_self
ON user_review_log
FOR INSERT
TO authenticated
WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY user_review_log_update_self
ON user_review_log
FOR UPDATE
TO authenticated
USING (user_id = (select auth.uid()))
WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY user_review_log_delete_self
ON user_review_log
FOR DELETE
TO authenticated
USING (user_id = (select auth.uid()));

-- =============================================================================
-- USER_SETTINGS POLICIES
-- =============================================================================
-- Optimized pattern: (select auth.uid()) and TO authenticated

DROP POLICY IF EXISTS user_settings_select_self ON user_settings;
DROP POLICY IF EXISTS user_settings_insert_self ON user_settings;
DROP POLICY IF EXISTS user_settings_update_self ON user_settings;
DROP POLICY IF EXISTS user_settings_delete_self ON user_settings;

CREATE POLICY user_settings_select_self
ON user_settings
FOR SELECT
TO authenticated
USING (user_id = (select auth.uid()));

CREATE POLICY user_settings_insert_self
ON user_settings
FOR INSERT
TO authenticated
WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY user_settings_update_self
ON user_settings
FOR UPDATE
TO authenticated
USING (user_id = (select auth.uid()))
WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY user_settings_delete_self
ON user_settings
FOR DELETE
TO authenticated
USING (user_id = (select auth.uid()));

-- =============================================================================
-- VERIFICATION
-- =============================================================================

-- Verify RLS is enabled:
-- SELECT tablename, rowsecurity FROM pg_tables
-- WHERE schemaname = 'public'
--   AND tablename IN ('user_review_log', 'user_settings');
--
-- Verify policies exist:
-- SELECT tablename, count(*) FROM pg_policies
-- WHERE schemaname = 'public'
--   AND tablename IN ('user_review_log', 'user_settings')
-- GROUP BY tablename;
