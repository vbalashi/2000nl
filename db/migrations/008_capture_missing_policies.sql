-- Migration: Capture missing RLS policies
-- Date: 2026-01-25
-- Context: Policies existed in production DB but were missing from migrations
-- Source: Manual export from production database (lliwdcpuuzjmxyzrjtoz.supabase.co)
-- Related: reports/migration-discrepancies-2026-01-25.md
--
-- NOTE: These policies use the non-optimized auth.uid() pattern and will be
-- optimized in migration 009_optimize_rls_performance.sql

-- =============================================================================
-- USER_WORD_STATUS RLS POLICIES
-- =============================================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'user_word_status'
          AND policyname = 'user_word_status_select_self'
    ) THEN
        CREATE POLICY user_word_status_select_self
        ON user_word_status
        FOR SELECT
        TO public
        USING (user_id = auth.uid());
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'user_word_status'
          AND policyname = 'user_word_status_insert_self'
    ) THEN
        CREATE POLICY user_word_status_insert_self
        ON user_word_status
        FOR INSERT
        TO public
        WITH CHECK (user_id = auth.uid());
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'user_word_status'
          AND policyname = 'user_word_status_update_self'
    ) THEN
        CREATE POLICY user_word_status_update_self
        ON user_word_status
        FOR UPDATE
        TO public
        USING (user_id = auth.uid())
        WITH CHECK (user_id = auth.uid());
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'user_word_status'
          AND policyname = 'user_word_status_delete_self'
    ) THEN
        CREATE POLICY user_word_status_delete_self
        ON user_word_status
        FOR DELETE
        TO public
        USING (user_id = auth.uid());
    END IF;
END $$;

-- =============================================================================
-- USER_EVENTS RLS POLICIES
-- =============================================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'user_events'
          AND policyname = 'user_events_select_self'
    ) THEN
        CREATE POLICY user_events_select_self
        ON user_events
        FOR SELECT
        TO public
        USING (user_id = auth.uid());
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'user_events'
          AND policyname = 'user_events_insert_self'
    ) THEN
        CREATE POLICY user_events_insert_self
        ON user_events
        FOR INSERT
        TO public
        WITH CHECK (user_id = auth.uid());
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'user_events'
          AND policyname = 'user_events_update_self'
    ) THEN
        CREATE POLICY user_events_update_self
        ON user_events
        FOR UPDATE
        TO public
        USING (user_id = auth.uid())
        WITH CHECK (user_id = auth.uid());
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'user_events'
          AND policyname = 'user_events_delete_self'
    ) THEN
        CREATE POLICY user_events_delete_self
        ON user_events
        FOR DELETE
        TO public
        USING (user_id = auth.uid());
    END IF;
END $$;

-- =============================================================================
-- INVESTIGATION NOTES
-- =============================================================================

-- user_review_log: RLS enabled in 005_security.sql:10, but RLS is DISABLED in production DB
-- user_settings: RLS enabled in 005_security.sql:12, but RLS is DISABLED in production DB
--
-- These tables need investigation:
-- - Why was RLS disabled?
-- - Are these tables even in use?
-- - Should we remove the ENABLE RLS statements from 005_security.sql?
