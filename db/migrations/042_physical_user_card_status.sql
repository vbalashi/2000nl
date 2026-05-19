-- Physical card-state storage.
--
-- This replaces the Stage 4 compatibility view with a table keyed by
-- user_id + entry_id + card_type_id. The legacy user_word_status table remains
-- in place for current scheduler/FSRS functions, and triggers keep both
-- storage shapes synchronized during the transition.

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public'
          AND c.relname = 'user_card_status'
          AND c.relkind = 'v'
    ) THEN
        EXECUTE 'DROP VIEW user_card_status';
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS user_card_status (
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    entry_id uuid NOT NULL REFERENCES word_entries(id) ON DELETE CASCADE,
    card_type_id text NOT NULL,

    fsrs_stability numeric,
    fsrs_difficulty numeric,
    fsrs_reps int DEFAULT 0,
    fsrs_lapses int DEFAULT 0,
    fsrs_last_grade smallint,
    fsrs_last_interval numeric,
    fsrs_target_retention numeric DEFAULT 0.9,
    fsrs_params_version text DEFAULT 'fsrs-6-default',
    fsrs_enabled boolean DEFAULT false,

    next_review_at timestamptz DEFAULT now(),
    last_seen_at timestamptz DEFAULT now(),
    last_reviewed_at timestamptz,

    click_count int DEFAULT 0,
    seen_count int DEFAULT 0,
    success_count int DEFAULT 0,

    last_result text,
    hidden boolean DEFAULT false,
    frozen_until timestamptz,

    in_learning boolean DEFAULT false,
    learning_due_at timestamptz,

    PRIMARY KEY (user_id, entry_id, card_type_id)
);

CREATE INDEX IF NOT EXISTS user_card_status_next_review_idx
    ON user_card_status(user_id, card_type_id, next_review_at);

CREATE INDEX IF NOT EXISTS user_card_status_clicks_idx
    ON user_card_status(user_id, card_type_id, click_count DESC);

CREATE INDEX IF NOT EXISTS user_card_status_fsrs_next_idx
    ON user_card_status(user_id, card_type_id, next_review_at);

INSERT INTO user_card_status (
    user_id,
    entry_id,
    card_type_id,
    fsrs_stability,
    fsrs_difficulty,
    fsrs_reps,
    fsrs_lapses,
    fsrs_last_grade,
    fsrs_last_interval,
    fsrs_target_retention,
    fsrs_params_version,
    fsrs_enabled,
    next_review_at,
    last_seen_at,
    last_reviewed_at,
    click_count,
    seen_count,
    success_count,
    last_result,
    hidden,
    frozen_until,
    in_learning,
    learning_due_at
)
SELECT
    user_id,
    word_id,
    mode,
    fsrs_stability,
    fsrs_difficulty,
    fsrs_reps,
    fsrs_lapses,
    fsrs_last_grade,
    fsrs_last_interval,
    fsrs_target_retention,
    fsrs_params_version,
    fsrs_enabled,
    next_review_at,
    last_seen_at,
    last_reviewed_at,
    click_count,
    seen_count,
    success_count,
    last_result,
    hidden,
    frozen_until,
    in_learning,
    learning_due_at
FROM user_word_status
ON CONFLICT (user_id, entry_id, card_type_id) DO UPDATE
SET fsrs_stability = excluded.fsrs_stability,
    fsrs_difficulty = excluded.fsrs_difficulty,
    fsrs_reps = excluded.fsrs_reps,
    fsrs_lapses = excluded.fsrs_lapses,
    fsrs_last_grade = excluded.fsrs_last_grade,
    fsrs_last_interval = excluded.fsrs_last_interval,
    fsrs_target_retention = excluded.fsrs_target_retention,
    fsrs_params_version = excluded.fsrs_params_version,
    fsrs_enabled = excluded.fsrs_enabled,
    next_review_at = excluded.next_review_at,
    last_seen_at = excluded.last_seen_at,
    last_reviewed_at = excluded.last_reviewed_at,
    click_count = excluded.click_count,
    seen_count = excluded.seen_count,
    success_count = excluded.success_count,
    last_result = excluded.last_result,
    hidden = excluded.hidden,
    frozen_until = excluded.frozen_until,
    in_learning = excluded.in_learning,
    learning_due_at = excluded.learning_due_at;

CREATE OR REPLACE FUNCTION private.sync_user_word_status_to_card_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
BEGIN
    IF pg_trigger_depth() > 1 THEN
        RETURN COALESCE(NEW, OLD);
    END IF;

    IF TG_OP = 'DELETE' THEN
        DELETE FROM user_card_status
        WHERE user_id = OLD.user_id
          AND entry_id = OLD.word_id
          AND card_type_id = OLD.mode;
        RETURN OLD;
    END IF;

    INSERT INTO user_card_status (
        user_id,
        entry_id,
        card_type_id,
        fsrs_stability,
        fsrs_difficulty,
        fsrs_reps,
        fsrs_lapses,
        fsrs_last_grade,
        fsrs_last_interval,
        fsrs_target_retention,
        fsrs_params_version,
        fsrs_enabled,
        next_review_at,
        last_seen_at,
        last_reviewed_at,
        click_count,
        seen_count,
        success_count,
        last_result,
        hidden,
        frozen_until,
        in_learning,
        learning_due_at
    )
    VALUES (
        NEW.user_id,
        NEW.word_id,
        NEW.mode,
        NEW.fsrs_stability,
        NEW.fsrs_difficulty,
        NEW.fsrs_reps,
        NEW.fsrs_lapses,
        NEW.fsrs_last_grade,
        NEW.fsrs_last_interval,
        NEW.fsrs_target_retention,
        NEW.fsrs_params_version,
        NEW.fsrs_enabled,
        NEW.next_review_at,
        NEW.last_seen_at,
        NEW.last_reviewed_at,
        NEW.click_count,
        NEW.seen_count,
        NEW.success_count,
        NEW.last_result,
        NEW.hidden,
        NEW.frozen_until,
        NEW.in_learning,
        NEW.learning_due_at
    )
    ON CONFLICT (user_id, entry_id, card_type_id) DO UPDATE
    SET fsrs_stability = excluded.fsrs_stability,
        fsrs_difficulty = excluded.fsrs_difficulty,
        fsrs_reps = excluded.fsrs_reps,
        fsrs_lapses = excluded.fsrs_lapses,
        fsrs_last_grade = excluded.fsrs_last_grade,
        fsrs_last_interval = excluded.fsrs_last_interval,
        fsrs_target_retention = excluded.fsrs_target_retention,
        fsrs_params_version = excluded.fsrs_params_version,
        fsrs_enabled = excluded.fsrs_enabled,
        next_review_at = excluded.next_review_at,
        last_seen_at = excluded.last_seen_at,
        last_reviewed_at = excluded.last_reviewed_at,
        click_count = excluded.click_count,
        seen_count = excluded.seen_count,
        success_count = excluded.success_count,
        last_result = excluded.last_result,
        hidden = excluded.hidden,
        frozen_until = excluded.frozen_until,
        in_learning = excluded.in_learning,
        learning_due_at = excluded.learning_due_at;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.sync_user_card_status_to_word_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
BEGIN
    IF pg_trigger_depth() > 1 THEN
        RETURN COALESCE(NEW, OLD);
    END IF;

    IF TG_OP = 'DELETE' THEN
        DELETE FROM user_word_status
        WHERE user_id = OLD.user_id
          AND word_id = OLD.entry_id
          AND mode = OLD.card_type_id;
        RETURN OLD;
    END IF;

    INSERT INTO user_word_status (
        user_id,
        word_id,
        mode,
        fsrs_stability,
        fsrs_difficulty,
        fsrs_reps,
        fsrs_lapses,
        fsrs_last_grade,
        fsrs_last_interval,
        fsrs_target_retention,
        fsrs_params_version,
        fsrs_enabled,
        next_review_at,
        last_seen_at,
        last_reviewed_at,
        click_count,
        seen_count,
        success_count,
        last_result,
        hidden,
        frozen_until,
        in_learning,
        learning_due_at
    )
    VALUES (
        NEW.user_id,
        NEW.entry_id,
        NEW.card_type_id,
        NEW.fsrs_stability,
        NEW.fsrs_difficulty,
        NEW.fsrs_reps,
        NEW.fsrs_lapses,
        NEW.fsrs_last_grade,
        NEW.fsrs_last_interval,
        NEW.fsrs_target_retention,
        NEW.fsrs_params_version,
        NEW.fsrs_enabled,
        NEW.next_review_at,
        NEW.last_seen_at,
        NEW.last_reviewed_at,
        NEW.click_count,
        NEW.seen_count,
        NEW.success_count,
        NEW.last_result,
        NEW.hidden,
        NEW.frozen_until,
        NEW.in_learning,
        NEW.learning_due_at
    )
    ON CONFLICT (user_id, word_id, mode) DO UPDATE
    SET fsrs_stability = excluded.fsrs_stability,
        fsrs_difficulty = excluded.fsrs_difficulty,
        fsrs_reps = excluded.fsrs_reps,
        fsrs_lapses = excluded.fsrs_lapses,
        fsrs_last_grade = excluded.fsrs_last_grade,
        fsrs_last_interval = excluded.fsrs_last_interval,
        fsrs_target_retention = excluded.fsrs_target_retention,
        fsrs_params_version = excluded.fsrs_params_version,
        fsrs_enabled = excluded.fsrs_enabled,
        next_review_at = excluded.next_review_at,
        last_seen_at = excluded.last_seen_at,
        last_reviewed_at = excluded.last_reviewed_at,
        click_count = excluded.click_count,
        seen_count = excluded.seen_count,
        success_count = excluded.success_count,
        last_result = excluded.last_result,
        hidden = excluded.hidden,
        frozen_until = excluded.frozen_until,
        in_learning = excluded.in_learning,
        learning_due_at = excluded.learning_due_at;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS user_word_status_sync_card_status ON user_word_status;
CREATE TRIGGER user_word_status_sync_card_status
AFTER INSERT OR UPDATE OR DELETE ON user_word_status
FOR EACH ROW
EXECUTE FUNCTION private.sync_user_word_status_to_card_status();

DROP TRIGGER IF EXISTS user_card_status_sync_word_status ON user_card_status;
CREATE TRIGGER user_card_status_sync_word_status
AFTER INSERT OR UPDATE OR DELETE ON user_card_status
FOR EACH ROW
EXECUTE FUNCTION private.sync_user_card_status_to_word_status();

ALTER TABLE user_card_status ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'user_card_status'
          AND policyname = 'user_card_status_select_self'
    ) THEN
        CREATE POLICY user_card_status_select_self ON user_card_status
            FOR SELECT TO authenticated USING (user_id = (select auth.uid()));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'user_card_status'
          AND policyname = 'user_card_status_insert_self'
    ) THEN
        CREATE POLICY user_card_status_insert_self ON user_card_status
            FOR INSERT TO authenticated WITH CHECK (user_id = (select auth.uid()));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'user_card_status'
          AND policyname = 'user_card_status_update_self'
    ) THEN
        CREATE POLICY user_card_status_update_self ON user_card_status
            FOR UPDATE TO authenticated
            USING (user_id = (select auth.uid()))
            WITH CHECK (user_id = (select auth.uid()));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'user_card_status'
          AND policyname = 'user_card_status_delete_self'
    ) THEN
        CREATE POLICY user_card_status_delete_self ON user_card_status
            FOR DELETE TO authenticated USING (user_id = (select auth.uid()));
    END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON user_card_status TO authenticated;
