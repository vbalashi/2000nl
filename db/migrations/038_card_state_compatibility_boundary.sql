-- Card-oriented compatibility boundary over the existing user_word_status table.
-- This keeps Stage 4 additive: new clients can use entry/card terminology while
-- the scheduler and FSRS engine continue to use the current storage contract.

CREATE OR REPLACE VIEW user_card_status
WITH (security_invoker = true)
AS
SELECT
    s.user_id,
    s.word_id AS entry_id,
    s.mode AS card_type_id,
    s.fsrs_stability,
    s.fsrs_difficulty,
    s.fsrs_reps,
    s.fsrs_lapses,
    s.fsrs_last_grade,
    s.fsrs_last_interval,
    s.fsrs_target_retention,
    s.fsrs_params_version,
    s.fsrs_enabled,
    s.next_review_at,
    s.last_seen_at,
    s.last_reviewed_at,
    s.click_count,
    s.seen_count,
    s.success_count,
    s.last_result,
    s.hidden,
    s.frozen_until,
    s.in_learning,
    s.learning_due_at
FROM user_word_status s;

GRANT SELECT ON user_card_status TO authenticated;

CREATE OR REPLACE FUNCTION get_user_card_state(
    p_user_id uuid,
    p_entry_id uuid,
    p_card_type_id text
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
    SELECT get_card_user_state(p_user_id, p_entry_id, p_card_type_id);
$$;

CREATE OR REPLACE FUNCTION record_card_view(
    p_user_id uuid,
    p_entry_id uuid,
    p_card_type_id text
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT record_word_view(p_user_id, p_entry_id, p_card_type_id);
$$;

CREATE OR REPLACE FUNCTION start_learning_entry_card(
    p_user_id uuid,
    p_entry_id uuid,
    p_card_type_id text
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT start_learning_card(p_user_id, p_entry_id, p_card_type_id);
$$;

CREATE OR REPLACE FUNCTION handle_card_review(
    p_user_id uuid,
    p_entry_id uuid,
    p_card_type_id text,
    p_result text,
    p_turn_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT handle_review(p_user_id, p_entry_id, p_card_type_id, p_result, p_turn_id);
$$;

GRANT EXECUTE ON FUNCTION get_user_card_state(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION record_card_view(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION start_learning_entry_card(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION handle_card_review(uuid, uuid, text, text, uuid) TO authenticated;
