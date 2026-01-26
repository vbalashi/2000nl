-- Security: Row Level Security policies
-- Generated: 2025-12-31
-- This file enables RLS and creates access policies for user data.

-- =============================================================================
-- ENABLE RLS ON USER-DATA TABLES
-- =============================================================================

ALTER TABLE IF EXISTS user_word_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS user_review_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS user_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS user_word_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS user_word_list_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS user_word_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS word_entry_translations ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- USER WORD STATUS RLS POLICIES
-- =============================================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'user_word_status' AND policyname = 'user_word_status_select_self'
    ) THEN
        CREATE POLICY user_word_status_select_self ON user_word_status
            FOR SELECT TO authenticated USING (user_id = (select auth.uid()));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'user_word_status' AND policyname = 'user_word_status_insert_self'
    ) THEN
        CREATE POLICY user_word_status_insert_self ON user_word_status
            FOR INSERT TO authenticated WITH CHECK (user_id = (select auth.uid()));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'user_word_status' AND policyname = 'user_word_status_update_self'
    ) THEN
        CREATE POLICY user_word_status_update_self ON user_word_status
            FOR UPDATE TO authenticated USING (user_id = (select auth.uid())) WITH CHECK (user_id = (select auth.uid()));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'user_word_status' AND policyname = 'user_word_status_delete_self'
    ) THEN
        CREATE POLICY user_word_status_delete_self ON user_word_status
            FOR DELETE TO authenticated USING (user_id = (select auth.uid()));
    END IF;
END $$;

-- =============================================================================
-- USER EVENTS RLS POLICIES
-- =============================================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'user_events' AND policyname = 'user_events_select_self'
    ) THEN
        CREATE POLICY user_events_select_self ON user_events
            FOR SELECT TO authenticated USING (user_id = (select auth.uid()));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'user_events' AND policyname = 'user_events_insert_self'
    ) THEN
        CREATE POLICY user_events_insert_self ON user_events
            FOR INSERT TO authenticated WITH CHECK (user_id = (select auth.uid()));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'user_events' AND policyname = 'user_events_update_self'
    ) THEN
        CREATE POLICY user_events_update_self ON user_events
            FOR UPDATE TO authenticated USING (user_id = (select auth.uid())) WITH CHECK (user_id = (select auth.uid()));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'user_events' AND policyname = 'user_events_delete_self'
    ) THEN
        CREATE POLICY user_events_delete_self ON user_events
            FOR DELETE TO authenticated USING (user_id = (select auth.uid()));
    END IF;
END $$;

-- =============================================================================
-- USER REVIEW LOG RLS POLICIES
-- =============================================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'user_review_log' AND policyname = 'user_review_log_select_self'
    ) THEN
        CREATE POLICY user_review_log_select_self ON user_review_log
            FOR SELECT TO authenticated USING (user_id = (select auth.uid()));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'user_review_log' AND policyname = 'user_review_log_insert_self'
    ) THEN
        CREATE POLICY user_review_log_insert_self ON user_review_log
            FOR INSERT TO authenticated WITH CHECK (user_id = (select auth.uid()));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'user_review_log' AND policyname = 'user_review_log_update_self'
    ) THEN
        CREATE POLICY user_review_log_update_self ON user_review_log
            FOR UPDATE TO authenticated USING (user_id = (select auth.uid())) WITH CHECK (user_id = (select auth.uid()));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'user_review_log' AND policyname = 'user_review_log_delete_self'
    ) THEN
        CREATE POLICY user_review_log_delete_self ON user_review_log
            FOR DELETE TO authenticated USING (user_id = (select auth.uid()));
    END IF;
END $$;

-- =============================================================================
-- USER SETTINGS RLS POLICIES
-- =============================================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'user_settings' AND policyname = 'user_settings_select_self'
    ) THEN
        CREATE POLICY user_settings_select_self ON user_settings
            FOR SELECT TO authenticated USING (user_id = (select auth.uid()));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'user_settings' AND policyname = 'user_settings_insert_self'
    ) THEN
        CREATE POLICY user_settings_insert_self ON user_settings
            FOR INSERT TO authenticated WITH CHECK (user_id = (select auth.uid()));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'user_settings' AND policyname = 'user_settings_update_self'
    ) THEN
        CREATE POLICY user_settings_update_self ON user_settings
            FOR UPDATE TO authenticated USING (user_id = (select auth.uid())) WITH CHECK (user_id = (select auth.uid()));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'user_settings' AND policyname = 'user_settings_delete_self'
    ) THEN
        CREATE POLICY user_settings_delete_self ON user_settings
            FOR DELETE TO authenticated USING (user_id = (select auth.uid()));
    END IF;
END $$;

-- =============================================================================
-- USER WORD LISTS RLS POLICIES
-- =============================================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'user_word_lists' AND policyname = 'select_own_user_word_lists'
    ) THEN
        CREATE POLICY select_own_user_word_lists ON user_word_lists
            FOR SELECT TO authenticated USING ((select auth.uid()) = user_id);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'user_word_lists' AND policyname = 'insert_own_user_word_lists'
    ) THEN
        CREATE POLICY insert_own_user_word_lists ON user_word_lists
            FOR INSERT TO authenticated WITH CHECK ((select auth.uid()) = user_id);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'user_word_lists' AND policyname = 'update_own_user_word_lists'
    ) THEN
        CREATE POLICY update_own_user_word_lists ON user_word_lists
            FOR UPDATE TO authenticated USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'user_word_lists' AND policyname = 'delete_own_user_word_lists'
    ) THEN
        CREATE POLICY delete_own_user_word_lists ON user_word_lists
            FOR DELETE TO authenticated USING ((select auth.uid()) = user_id);
    END IF;
END $$;

-- =============================================================================
-- USER WORD LIST ITEMS RLS POLICIES
-- =============================================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'user_word_list_items' AND policyname = 'select_items_for_owned_lists'
    ) THEN
        CREATE POLICY select_items_for_owned_lists ON user_word_list_items
            FOR SELECT TO authenticated USING (EXISTS (
                SELECT 1 FROM user_word_lists l
                WHERE l.id = list_id AND l.user_id = (select auth.uid())
            ));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'user_word_list_items' AND policyname = 'insert_items_for_owned_lists'
    ) THEN
        CREATE POLICY insert_items_for_owned_lists ON user_word_list_items
            FOR INSERT TO authenticated WITH CHECK (EXISTS (
                SELECT 1 FROM user_word_lists l
                WHERE l.id = list_id AND l.user_id = (select auth.uid())
            ));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'user_word_list_items' AND policyname = 'update_items_for_owned_lists'
    ) THEN
        CREATE POLICY update_items_for_owned_lists ON user_word_list_items
            FOR UPDATE TO authenticated
            USING (EXISTS (
                SELECT 1 FROM user_word_lists l
                WHERE l.id = list_id AND l.user_id = (select auth.uid())
            ))
            WITH CHECK (EXISTS (
                SELECT 1 FROM user_word_lists l
                WHERE l.id = list_id AND l.user_id = (select auth.uid())
            ));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'user_word_list_items' AND policyname = 'delete_items_for_owned_lists'
    ) THEN
        CREATE POLICY delete_items_for_owned_lists ON user_word_list_items
            FOR DELETE TO authenticated USING (EXISTS (
                SELECT 1 FROM user_word_lists l
                WHERE l.id = list_id AND l.user_id = (select auth.uid())
            ));
    END IF;
END $$;

-- =============================================================================
-- WORD TRANSLATIONS RLS POLICIES (public read, service-role write)
-- =============================================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'word_entry_translations'
          AND policyname = 'select_word_entry_translations'
    ) THEN
        CREATE POLICY select_word_entry_translations ON word_entry_translations
            FOR SELECT USING (true);
    END IF;
END $$;

-- =============================================================================
-- USER WORD NOTES RLS POLICIES
-- =============================================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'user_word_notes'
          AND policyname = 'select_own_user_word_notes'
    ) THEN
        CREATE POLICY select_own_user_word_notes ON user_word_notes
            FOR SELECT TO authenticated USING ((select auth.uid()) = user_id);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'user_word_notes'
          AND policyname = 'insert_own_user_word_notes'
    ) THEN
        CREATE POLICY insert_own_user_word_notes ON user_word_notes
            FOR INSERT TO authenticated WITH CHECK ((select auth.uid()) = user_id);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'user_word_notes'
          AND policyname = 'update_own_user_word_notes'
    ) THEN
        CREATE POLICY update_own_user_word_notes ON user_word_notes
            FOR UPDATE TO authenticated USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'user_word_notes'
          AND policyname = 'delete_own_user_word_notes'
    ) THEN
        CREATE POLICY delete_own_user_word_notes ON user_word_notes
            FOR DELETE TO authenticated USING ((select auth.uid()) = user_id);
    END IF;
END $$;

-- =============================================================================
-- PRIVATE SCHEMA (Internal Functions)
-- =============================================================================
-- Functions in private schema are NOT exposed via PostgREST API.
-- Only callable via SQL: SELECT * FROM private.function_name(...)

CREATE SCHEMA IF NOT EXISTS private;

-- Revoke all permissions from public roles
REVOKE ALL ON SCHEMA private FROM public, anon, authenticated;

-- Grant usage only to postgres role (superuser/owner)
GRANT USAGE ON SCHEMA private TO postgres;
GRANT CREATE ON SCHEMA private TO postgres;

-- =============================================================================
-- SET SEARCH PATH FOR FUNCTIONS
-- =============================================================================

-- Ensure search_path includes public for all functions
ALTER DATABASE postgres SET search_path TO public, extensions;
