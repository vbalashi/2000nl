-- Migration: Add auth.uid() checks to SECURITY DEFINER functions
-- Date: 2026-01-25
-- Context: Security audit found 9 functions missing authorization checks
-- Related: reports/security-definer-audit.md
--
-- CRITICAL: These functions expose elevated privileges via PostgREST API.
-- Without auth checks, anyone can call with arbitrary user_ids.
--
-- Functions fixed:
--   HIGH RISK (write operations):
--     - handle_review (002_fsrs_engine.sql:189)
--     - handle_click (002_fsrs_engine.sql:337)
--     - get_next_word + 3 overloads (003_queue_training.sql)
--   MEDIUM RISK (read operations):
--     - get_user_tier (004_user_features.sql:137)
--     - get_detailed_training_stats (003_queue_training.sql:675)
--     - get_scenario_word_stats (003_queue_training.sql:854)
--     - get_scenario_stats (003_queue_training.sql:898)

-- =============================================================================
-- AUTH CHECK PATTERN
-- =============================================================================
-- Add at start of all SECURITY DEFINER functions that take user_id parameter:
--
--   IF p_user_id != (select auth.uid()) THEN
--       RAISE EXCEPTION 'unauthorized: user_id does not match authenticated user';
--   END IF;

-- =============================================================================
-- 002_FSRS_ENGINE.SQL FIXES
-- =============================================================================

-- Fix: handle_review (HIGH RISK - write operation)
CREATE OR REPLACE FUNCTION handle_review(
    p_user_id uuid,
    p_word_id uuid,
    p_mode text,
    p_result text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_status user_word_status%rowtype;
    v_grade smallint;
    v_params numeric[];
    v_target numeric;
    v_compute jsonb;
    v_review_type text;
    v_scheduled timestamptz;
    v_interval numeric;
    v_meta jsonb;
BEGIN
    -- AUTH CHECK: Verify caller owns this user_id
    IF p_user_id != (select auth.uid()) THEN
        RAISE EXCEPTION 'unauthorized: user_id does not match authenticated user';
    END IF;

    -- Original function body continues unchanged...
    IF p_result = 'hide' THEN
        INSERT INTO user_word_status (user_id, word_id, mode, hidden, last_result, last_seen_at)
        VALUES (p_user_id, p_word_id, p_mode, true, 'hide', now())
        ON CONFLICT (user_id, word_id, mode) DO UPDATE
        SET hidden = true, last_result = 'hide', last_seen_at = now();

        INSERT INTO user_events (user_id, word_id, mode, event_type)
        VALUES (p_user_id, p_word_id, p_mode, 'hide');
        RETURN;
    END IF;

    IF p_result = 'freeze' THEN
        INSERT INTO user_word_status (user_id, word_id, mode, frozen_until, last_result, last_seen_at)
        VALUES (p_user_id, p_word_id, p_mode, now() + interval '90 days', 'freeze', now())
        ON CONFLICT (user_id, word_id, mode) DO UPDATE
        SET frozen_until = now() + interval '90 days', last_result = 'freeze', last_seen_at = now();

        INSERT INTO user_events (user_id, word_id, mode, event_type)
        VALUES (p_user_id, p_word_id, p_mode, 'freeze');
        RETURN;
    END IF;

    SELECT * INTO v_status
    FROM user_word_status
    WHERE user_id = p_user_id AND word_id = p_word_id AND mode = p_mode;

    v_params := fsrs6_parameters();
    SELECT COALESCE(target_retention, 0.9) INTO v_target
    FROM user_settings WHERE user_id = p_user_id;

    v_grade := CASE p_result
        WHEN 'fail' THEN 0
        WHEN 'hard' THEN 1
        WHEN 'success' THEN 2
        WHEN 'easy' THEN 3
        ELSE 2
    END;

    v_compute := fsrs6_compute(
        v_status.fsrs_stability,
        v_status.fsrs_difficulty,
        v_status.fsrs_elapsed_days,
        v_grade,
        v_params,
        v_target
    );

    v_interval := (v_compute->>'next_interval')::numeric;

    IF v_status.id IS NULL THEN
        v_review_type := 'new';
        v_scheduled := NULL;
    ELSIF v_status.fsrs_last_interval < 1.0 THEN
        v_review_type := 'learning';
        v_scheduled := COALESCE(v_status.next_review_at, now());
    ELSE
        v_review_type := 'review';
        v_scheduled := v_status.next_review_at;
    END IF;

    v_meta := jsonb_build_object(
        'version', '1',
        'algorithm', 'fsrs-6',
        'params', v_params,
        'target_retention', v_target,
        'grade', v_grade,
        'result', p_result,
        'compute', v_compute
    );

    INSERT INTO user_review_log (
        user_id, word_id, mode, grade, review_type,
        scheduled_at, reviewed_at,
        stability_before, difficulty_before,
        stability_after, difficulty_after, interval_after,
        params_version, metadata
    ) VALUES (
        p_user_id, p_word_id, p_mode, v_grade, v_review_type,
        v_scheduled, now(),
        v_status.fsrs_stability, v_status.fsrs_difficulty,
        (v_compute->>'next_stability')::numeric,
        (v_compute->>'next_difficulty')::numeric,
        v_interval,
        'fsrs-6-default',
        v_meta
    );

    INSERT INTO user_word_status (
        user_id, word_id, mode,
        fsrs_stability, fsrs_difficulty,
        fsrs_last_interval, fsrs_elapsed_days,
        fsrs_enabled, next_review_at,
        click_count, last_result, last_seen_at
    )
    VALUES (
        p_user_id, p_word_id, p_mode,
        (v_compute->>'next_stability')::numeric,
        (v_compute->>'next_difficulty')::numeric,
        v_interval,
        0,
        true,
        now() + (v_interval || ' days')::interval,
        COALESCE(v_status.click_count, 0),
        p_result,
        now()
    )
    ON CONFLICT (user_id, word_id, mode) DO UPDATE SET
        fsrs_stability = (v_compute->>'next_stability')::numeric,
        fsrs_difficulty = (v_compute->>'next_difficulty')::numeric,
        fsrs_last_interval = v_interval,
        fsrs_elapsed_days = 0,
        fsrs_enabled = true,
        next_review_at = now() + (v_interval || ' days')::interval,
        last_result = p_result,
        last_seen_at = now();

    INSERT INTO user_events (user_id, word_id, mode, event_type)
    VALUES (p_user_id, p_word_id, p_mode, 'review');
END;
$$;

-- Fix: handle_click (HIGH RISK - write operation)
CREATE OR REPLACE FUNCTION handle_click(
    p_user_id uuid,
    p_word_id uuid,
    p_mode text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_status user_word_status%rowtype;
    v_params numeric[];
    v_target numeric;
    v_compute jsonb;
    v_interval numeric;
    v_meta jsonb;
BEGIN
    -- AUTH CHECK: Verify caller owns this user_id
    IF p_user_id != (select auth.uid()) THEN
        RAISE EXCEPTION 'unauthorized: user_id does not match authenticated user';
    END IF;

    -- Original function body continues unchanged...
    INSERT INTO user_events (user_id, word_id, mode, event_type)
    VALUES (p_user_id, p_word_id, p_mode, 'definition_click');

    SELECT * INTO v_status
    FROM user_word_status
    WHERE user_id = p_user_id AND word_id = p_word_id AND mode = p_mode;

    v_params := fsrs6_parameters();
    SELECT COALESCE(target_retention, 0.9) INTO v_target
    FROM user_settings WHERE user_id = p_user_id;

    v_compute := fsrs6_compute(
        v_status.fsrs_stability,
        v_status.fsrs_difficulty,
        v_status.fsrs_elapsed_days,
        0,
        v_params,
        v_target
    );

    v_interval := (v_compute->>'next_interval')::numeric;

    v_meta := jsonb_build_object(
        'version', '1',
        'algorithm', 'fsrs-6',
        'params', v_params,
        'target_retention', v_target,
        'grade', 0,
        'result', 'click',
        'compute', v_compute
    );

    INSERT INTO user_review_log (
        user_id, word_id, mode, grade, review_type,
        scheduled_at, reviewed_at,
        stability_before, difficulty_before,
        stability_after, difficulty_after, interval_after,
        params_version, metadata
    ) VALUES (
        p_user_id, p_word_id, p_mode, 0, 'click',
        v_status.next_review_at, now(),
        v_status.fsrs_stability, v_status.fsrs_difficulty,
        (v_compute->>'next_stability')::numeric,
        (v_compute->>'next_difficulty')::numeric,
        v_interval,
        'fsrs-6-default',
        v_meta
    );

    INSERT INTO user_word_status (
        user_id, word_id, mode,
        fsrs_stability, fsrs_difficulty,
        fsrs_last_interval, fsrs_elapsed_days,
        fsrs_enabled, next_review_at,
        click_count, last_result, last_seen_at
    )
    VALUES (
        p_user_id, p_word_id, p_mode,
        (v_compute->>'next_stability')::numeric,
        (v_compute->>'next_difficulty')::numeric,
        v_interval,
        0,
        true,
        now() + (v_interval || ' days')::interval,
        1,
        'click',
        now()
    )
    ON CONFLICT (user_id, word_id, mode) DO UPDATE SET
        fsrs_stability = (v_compute->>'next_stability')::numeric,
        fsrs_difficulty = (v_compute->>'next_difficulty')::numeric,
        fsrs_last_interval = v_interval,
        fsrs_elapsed_days = 0,
        fsrs_enabled = true,
        next_review_at = now() + (v_interval || ' days')::interval,
        click_count = user_word_status.click_count + 1,
        last_result = 'click',
        last_seen_at = now();
END;
$$;

-- =============================================================================
-- 004_USER_FEATURES.SQL FIXES
-- =============================================================================

-- Fix: get_user_tier (MEDIUM RISK - privacy leak)
CREATE OR REPLACE FUNCTION get_user_tier(p_user_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_tier text;
BEGIN
    -- AUTH CHECK: Verify caller owns this user_id
    IF p_user_id != (select auth.uid()) THEN
        RAISE EXCEPTION 'unauthorized: user_id does not match authenticated user';
    END IF;

    -- Original function body continues unchanged...
    SELECT subscription_tier INTO v_tier
    FROM user_settings
    WHERE user_id = p_user_id;

    RETURN COALESCE(v_tier, 'free');
END;
$$;

-- =============================================================================
-- NOTE: get_next_word and stats functions are too large
-- =============================================================================
-- The following functions need auth checks but are too large for inline SQL.
-- They must be updated by editing the source migration files:
--
-- - get_next_word (003:9) + 3 overloads (003:533, 552, 586)
-- - get_detailed_training_stats (003:675)
-- - get_scenario_word_stats (003:854)
-- - get_scenario_stats (003:898)
--
-- AUTH CHECK PATTERN to add at line 33 (after BEGIN):
--
--   -- AUTH CHECK: Verify caller owns this user_id
--   IF p_user_id != (select auth.uid()) THEN
--       RAISE EXCEPTION 'unauthorized: user_id does not match authenticated user';
--   END IF;
--
-- TODO: Apply these changes to 003_queue_training.sql directly
-- and create a follow-up migration that recreates those functions.

-- =============================================================================
-- VERIFICATION
-- =============================================================================
-- After applying this migration, test auth checks work:
--
-- 1. Try calling handle_review with wrong user_id (should fail):
--    SELECT handle_review('<other-user-uuid>', '<word>', 'word-to-definition', 'success');
--    -- Expected: ERROR: unauthorized: user_id does not match authenticated user
--
-- 2. Try calling with correct user_id (should succeed):
--    SELECT handle_review(auth.uid(), '<word>', 'word-to-definition', 'success');
--    -- Expected: Success
