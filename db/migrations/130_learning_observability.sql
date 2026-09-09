-- Make enrollment and first graded learning activity observable without
-- pretending that enrollment was an FSRS rating.
--
-- `user_card_action_events` is the immutable source for an accepted Learn
-- action. Review rows remain the source for actual FSRS grades. Keeping the
-- two event kinds distinct lets the UI explain what happened without changing
-- scheduling semantics.

BEGIN;

CREATE OR REPLACE FUNCTION public.get_detailed_training_stats(
    p_user_id uuid,
    p_modes text[] DEFAULT ARRAY['word-to-definition'],
    p_list_id uuid DEFAULT NULL,
    p_list_type text DEFAULT 'curated'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
    v_new_words_today int;
    v_new_cards_today int;
    v_learning_started_today int;
    v_graduated_new_words_today int;
    v_daily_new_limit int;
    v_review_words_done int;
    v_review_cards_done int;
    v_review_words_due int;
    v_review_cards_due int;
    v_total_words_learned int;
    v_total_words_in_list int;
BEGIN
    IF (select auth.uid()) IS NULL OR p_user_id IS DISTINCT FROM (select auth.uid()) THEN
        RAISE EXCEPTION 'unauthorized: user_id does not match authenticated user';
    END IF;

    IF p_modes IS NULL OR array_length(p_modes, 1) IS NULL THEN
        p_modes := ARRAY['word-to-definition'];
    END IF;

    IF p_list_id IS NOT NULL AND p_list_type IS NULL THEN
        p_list_type := 'curated';
    END IF;

    SELECT COALESCE(daily_new_limit, 10) INTO v_daily_new_limit
    FROM user_settings WHERE user_id = p_user_id;
    v_daily_new_limit := COALESCE(v_daily_new_limit, 10);

    -- A card is introduced when Learn is accepted. The review-log fallback
    -- keeps direct/older first grades visible while no historical rewrite is
    -- needed. Counts are exact entry + card type, not word-only guesses.
    WITH accessible_entries AS (
        SELECT w.id
        FROM word_entries w
        WHERE (w.dictionary_id IS NULL OR can_access_dictionary(p_user_id, w.dictionary_id, 'read'))
          AND (
                (p_list_id IS NULL AND w.is_nt2_2000 = true)
             OR (p_list_id IS NOT NULL AND p_list_type = 'curated' AND EXISTS (
                    SELECT 1 FROM word_list_items li
                    WHERE li.list_id = p_list_id AND li.word_id = w.id
                ))
             OR (p_list_id IS NOT NULL AND p_list_type = 'user' AND EXISTS (
                    SELECT 1 FROM user_word_list_items li
                    JOIN user_word_lists l ON l.id = li.list_id
                    WHERE li.list_id = p_list_id AND li.word_id = w.id AND l.user_id = p_user_id
                ))
          )
    ), introduced_cards AS (
        SELECT e.entry_id, e.card_type_id
        FROM user_card_action_events e
        WHERE e.user_id = p_user_id
          AND e.card_type_id = ANY(p_modes)
          AND e.action = 'start-learning'
          AND e.created_at::date = current_date
        UNION
        SELECT rl.word_id, rl.mode
        FROM user_review_log rl
        WHERE rl.user_id = p_user_id
          AND rl.mode = ANY(p_modes)
          AND rl.review_type = 'new'
          AND rl.reviewed_at::date = current_date
    )
    SELECT COUNT(DISTINCT ic.entry_id), COUNT(*)
    INTO v_new_words_today, v_new_cards_today
    FROM introduced_cards ic
    JOIN accessible_entries ae ON ae.id = ic.entry_id;

    SELECT COUNT(DISTINCT e.entry_id)
    INTO v_learning_started_today
    FROM user_card_action_events e
    WHERE e.user_id = p_user_id
      AND e.card_type_id = ANY(p_modes)
      AND e.action = 'start-learning'
      AND e.created_at::date = current_date
      AND EXISTS (
          SELECT 1 FROM word_entries w
          WHERE w.id = e.entry_id
            AND (w.dictionary_id IS NULL OR can_access_dictionary(p_user_id, w.dictionary_id, 'read'))
            AND (
                  (p_list_id IS NULL AND w.is_nt2_2000 = true)
               OR (p_list_id IS NOT NULL AND p_list_type = 'curated' AND EXISTS (
                      SELECT 1 FROM word_list_items li
                      WHERE li.list_id = p_list_id AND li.word_id = w.id
                  ))
               OR (p_list_id IS NOT NULL AND p_list_type = 'user' AND EXISTS (
                      SELECT 1 FROM user_word_list_items li
                      JOIN user_word_lists l ON l.id = li.list_id
                      WHERE li.list_id = p_list_id AND li.word_id = w.id AND l.user_id = p_user_id
                  ))
            )
      );

    -- A graduated-new metric is kept separate from the introduced metric so
    -- callers can explain both concepts without overloading `newWordsToday`.
    WITH accessible_entries AS (
        SELECT w.id
        FROM word_entries w
        WHERE (w.dictionary_id IS NULL OR can_access_dictionary(p_user_id, w.dictionary_id, 'read'))
          AND (
                (p_list_id IS NULL AND w.is_nt2_2000 = true)
             OR (p_list_id IS NOT NULL AND p_list_type = 'curated' AND EXISTS (
                    SELECT 1 FROM word_list_items li
                    WHERE li.list_id = p_list_id AND li.word_id = w.id
                ))
             OR (p_list_id IS NOT NULL AND p_list_type = 'user' AND EXISTS (
                    SELECT 1 FROM user_word_list_items li
                    JOIN user_word_lists l ON l.id = li.list_id
                    WHERE li.list_id = p_list_id AND li.word_id = w.id AND l.user_id = p_user_id
                ))
          )
    )
    SELECT COUNT(DISTINCT rl.word_id)
    INTO v_graduated_new_words_today
    FROM user_review_log rl
    JOIN user_card_status s ON s.entry_id = rl.word_id
        AND s.user_id = rl.user_id
        AND s.card_type_id = rl.mode
    JOIN accessible_entries ae ON ae.id = rl.word_id
    WHERE rl.user_id = p_user_id
      AND rl.mode = ANY(p_modes)
      AND rl.review_type = 'new'
      AND rl.reviewed_at::date = current_date
      AND s.fsrs_last_interval >= 1.0;

    WITH accessible_entries AS (
        SELECT w.id
        FROM word_entries w
        WHERE (w.dictionary_id IS NULL OR can_access_dictionary(p_user_id, w.dictionary_id, 'read'))
          AND (
                (p_list_id IS NULL AND w.is_nt2_2000 = true)
             OR (p_list_id IS NOT NULL AND p_list_type = 'curated' AND EXISTS (
                    SELECT 1 FROM word_list_items li
                    WHERE li.list_id = p_list_id AND li.word_id = w.id
                ))
             OR (p_list_id IS NOT NULL AND p_list_type = 'user' AND EXISTS (
                    SELECT 1 FROM user_word_list_items li
                    JOIN user_word_lists l ON l.id = li.list_id
                    WHERE li.list_id = p_list_id AND li.word_id = w.id AND l.user_id = p_user_id
                ))
          )
    )
    SELECT COUNT(DISTINCT rl.word_id), COUNT(*)
    INTO v_review_words_done, v_review_cards_done
    FROM user_review_log rl
    JOIN accessible_entries ae ON ae.id = rl.word_id
    WHERE rl.user_id = p_user_id
      AND rl.mode = ANY(p_modes)
      AND rl.review_type = 'review'
      AND rl.reviewed_at::date = current_date
      AND rl.interval_after >= 1.0;

    WITH accessible_entries AS (
        SELECT w.id
        FROM word_entries w
        WHERE (w.dictionary_id IS NULL OR can_access_dictionary(p_user_id, w.dictionary_id, 'read'))
          AND (
                (p_list_id IS NULL AND w.is_nt2_2000 = true)
             OR (p_list_id IS NOT NULL AND p_list_type = 'curated' AND EXISTS (
                    SELECT 1 FROM word_list_items li
                    WHERE li.list_id = p_list_id AND li.word_id = w.id
                ))
             OR (p_list_id IS NOT NULL AND p_list_type = 'user' AND EXISTS (
                    SELECT 1 FROM user_word_list_items li
                    JOIN user_word_lists l ON l.id = li.list_id
                    WHERE li.list_id = p_list_id AND li.word_id = w.id AND l.user_id = p_user_id
                ))
          )
    )
    SELECT COUNT(DISTINCT s.entry_id), COUNT(*)
    INTO v_review_words_due, v_review_cards_due
    FROM user_card_status s
    JOIN accessible_entries ae ON ae.id = s.entry_id
    WHERE s.user_id = p_user_id
      AND s.card_type_id = ANY(p_modes)
      AND s.next_review_at < (current_date + interval '1 day')
      AND (s.frozen_until IS NULL OR s.frozen_until <= now())
      AND s.hidden = false
      AND s.fsrs_enabled = true
      AND NOT EXISTS (
          SELECT 1 FROM user_review_log rl
          WHERE rl.user_id = s.user_id
            AND rl.word_id = s.entry_id
            AND rl.mode = s.card_type_id
            AND rl.review_type = 'new'
            AND rl.reviewed_at::date = current_date
      );

    WITH accessible_entries AS (
        SELECT w.id
        FROM word_entries w
        WHERE (w.dictionary_id IS NULL OR can_access_dictionary(p_user_id, w.dictionary_id, 'read'))
          AND (
                (p_list_id IS NULL AND w.is_nt2_2000 = true)
             OR (p_list_id IS NOT NULL AND p_list_type = 'curated' AND EXISTS (
                    SELECT 1 FROM word_list_items li
                    WHERE li.list_id = p_list_id AND li.word_id = w.id
                ))
             OR (p_list_id IS NOT NULL AND p_list_type = 'user' AND EXISTS (
                    SELECT 1 FROM user_word_list_items li
                    JOIN user_word_lists l ON l.id = li.list_id
                    WHERE li.list_id = p_list_id AND li.word_id = w.id AND l.user_id = p_user_id
                ))
          )
    )
    SELECT COUNT(DISTINCT s.entry_id)
    INTO v_total_words_learned
    FROM user_card_status s
    JOIN accessible_entries ae ON ae.id = s.entry_id
    WHERE s.user_id = p_user_id
      AND s.card_type_id = ANY(p_modes)
      AND s.fsrs_enabled = true;

    WITH accessible_entries AS (
        SELECT w.id
        FROM word_entries w
        WHERE (w.dictionary_id IS NULL OR can_access_dictionary(p_user_id, w.dictionary_id, 'read'))
          AND (
                (p_list_id IS NULL AND w.is_nt2_2000 = true)
             OR (p_list_id IS NOT NULL AND p_list_type = 'curated' AND EXISTS (
                    SELECT 1 FROM word_list_items li
                    WHERE li.list_id = p_list_id AND li.word_id = w.id
                ))
             OR (p_list_id IS NOT NULL AND p_list_type = 'user' AND EXISTS (
                    SELECT 1 FROM user_word_list_items li
                    JOIN user_word_lists l ON l.id = li.list_id
                    WHERE li.list_id = p_list_id AND li.word_id = w.id AND l.user_id = p_user_id
                ))
          )
    )
    SELECT COUNT(*) INTO v_total_words_in_list FROM accessible_entries;

    RETURN jsonb_build_object(
        'newWordsToday', v_new_words_today,
        'newCardsToday', v_new_cards_today,
        'learningStartedToday', v_learning_started_today,
        'graduatedNewWordsToday', v_graduated_new_words_today,
        'dailyNewLimit', v_daily_new_limit,
        'reviewWordsDone', v_review_words_done,
        'reviewCardsDone', v_review_cards_done,
        'reviewWordsDue', v_review_words_due,
        'reviewCardsDue', v_review_cards_due,
        'totalWordsLearned', v_total_words_learned,
        'totalWordsInList', v_total_words_in_list
    );
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_recent_training_review_history(
    p_limit integer DEFAULT 50
)
RETURNS TABLE(
    entry_id uuid,
    headword text,
    part_of_speech text,
    review_result text,
    card_type_id text,
    reviewed_at timestamptz,
    has_more boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
    v_user_id uuid := (select auth.uid());
    v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 50);
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'unauthorized: authenticated user required';
    END IF;

    RETURN QUERY
    WITH activity AS MATERIALIZED (
        SELECT
            w.id AS entry_id,
            w.headword,
            w.part_of_speech,
            'learning_started'::text AS review_result,
            e.card_type_id,
            e.created_at AS reviewed_at,
            e.id AS activity_id
        FROM public.user_card_action_events e
        JOIN public.word_entries w ON w.id = e.entry_id
        WHERE e.user_id = v_user_id
          AND e.action = 'start-learning'
          AND e.created_at >= pg_catalog.now() - interval '24 hours'
          AND (
              w.dictionary_id IS NULL
              OR public.can_access_dictionary(v_user_id, w.dictionary_id, 'read')
          )
        UNION ALL
        SELECT
            w.id AS entry_id,
            w.headword,
            w.part_of_speech,
            CASE rl.grade
                WHEN 1 THEN 'review_fail'
                WHEN 2 THEN 'review_hard'
                WHEN 3 THEN 'review_success'
                WHEN 4 THEN 'review_easy'
            END AS review_result,
            rl.mode AS card_type_id,
            rl.reviewed_at,
            rl.id AS activity_id
        FROM public.user_review_log rl
        JOIN public.word_entries w ON w.id = rl.word_id
        WHERE rl.user_id = v_user_id
          AND rl.reviewed_at >= pg_catalog.now() - interval '24 hours'
          AND rl.grade BETWEEN 1 AND 4
          AND (
              w.dictionary_id IS NULL
              OR public.can_access_dictionary(v_user_id, w.dictionary_id, 'read')
          )
    ), bounded AS MATERIALIZED (
        SELECT *
        FROM activity
        ORDER BY reviewed_at DESC, activity_id DESC
        LIMIT v_limit + 1
    ), projection AS (
        SELECT (pg_catalog.count(*) > v_limit) AS has_more
        FROM bounded
    )
    SELECT
        b.entry_id,
        b.headword,
        b.part_of_speech,
        b.review_result,
        b.card_type_id,
        b.reviewed_at,
        p.has_more
    FROM bounded b
    CROSS JOIN projection p
    ORDER BY b.reviewed_at DESC, b.activity_id DESC
    LIMIT v_limit;
END;
$function$;

COMMENT ON FUNCTION public.get_detailed_training_stats(uuid, text[], uuid, text) IS
'Authenticated training statistics with explicit introduced, learning-started, graduated, and review projections.';

COMMENT ON FUNCTION public.get_recent_training_review_history(integer) IS
'Authenticated display-only projection of recent learning-started and graded review activity from the server-owned trailing 24-hour window.';

COMMIT;
