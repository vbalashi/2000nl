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
-- USER WORD LISTS RLS POLICIES
-- =============================================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'user_word_lists' AND policyname = 'select_own_user_word_lists'
    ) THEN
        CREATE POLICY select_own_user_word_lists ON user_word_lists
            FOR SELECT USING (auth.uid() = user_id);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'user_word_lists' AND policyname = 'insert_own_user_word_lists'
    ) THEN
        CREATE POLICY insert_own_user_word_lists ON user_word_lists
            FOR INSERT WITH CHECK (auth.uid() = user_id);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'user_word_lists' AND policyname = 'update_own_user_word_lists'
    ) THEN
        CREATE POLICY update_own_user_word_lists ON user_word_lists
            FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'user_word_lists' AND policyname = 'delete_own_user_word_lists'
    ) THEN
        CREATE POLICY delete_own_user_word_lists ON user_word_lists
            FOR DELETE USING (auth.uid() = user_id);
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
            FOR SELECT USING (EXISTS (
                SELECT 1 FROM user_word_lists l
                WHERE l.id = list_id AND l.user_id = auth.uid()
            ));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'user_word_list_items' AND policyname = 'insert_items_for_owned_lists'
    ) THEN
        CREATE POLICY insert_items_for_owned_lists ON user_word_list_items
            FOR INSERT WITH CHECK (EXISTS (
                SELECT 1 FROM user_word_lists l
                WHERE l.id = list_id AND l.user_id = auth.uid()
            ));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'user_word_list_items' AND policyname = 'update_items_for_owned_lists'
    ) THEN
        CREATE POLICY update_items_for_owned_lists ON user_word_list_items
            FOR UPDATE 
            USING (EXISTS (
                SELECT 1 FROM user_word_lists l
                WHERE l.id = list_id AND l.user_id = auth.uid()
            ))
            WITH CHECK (EXISTS (
                SELECT 1 FROM user_word_lists l
                WHERE l.id = list_id AND l.user_id = auth.uid()
            ));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'user_word_list_items' AND policyname = 'delete_items_for_owned_lists'
    ) THEN
        CREATE POLICY delete_items_for_owned_lists ON user_word_list_items
            FOR DELETE USING (EXISTS (
                SELECT 1 FROM user_word_lists l
                WHERE l.id = list_id AND l.user_id = auth.uid()
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
            FOR SELECT USING (auth.uid() = user_id);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'user_word_notes'
          AND policyname = 'insert_own_user_word_notes'
    ) THEN
        CREATE POLICY insert_own_user_word_notes ON user_word_notes
            FOR INSERT WITH CHECK (auth.uid() = user_id);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'user_word_notes'
          AND policyname = 'update_own_user_word_notes'
    ) THEN
        CREATE POLICY update_own_user_word_notes ON user_word_notes
            FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'user_word_notes'
          AND policyname = 'delete_own_user_word_notes'
    ) THEN
        CREATE POLICY delete_own_user_word_notes ON user_word_notes
            FOR DELETE USING (auth.uid() = user_id);
    END IF;
END $$;

-- =============================================================================
-- SET SEARCH PATH FOR FUNCTIONS
-- =============================================================================

-- Ensure search_path includes public for all functions
ALTER DATABASE postgres SET search_path TO public, extensions;
