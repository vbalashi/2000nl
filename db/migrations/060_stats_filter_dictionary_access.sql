-- Ensure training stats use the same dictionary visibility boundary as scheduler/history.

CREATE OR REPLACE FUNCTION public.get_training_stats(
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
    v_today_count int;
    v_total_success int;
    v_total_items int;
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
    SELECT COUNT(*) INTO v_today_count
    FROM user_review_log rl
    JOIN accessible_entries ae ON ae.id = rl.word_id
    WHERE rl.user_id = p_user_id
      AND rl.mode = ANY(p_modes)
      AND rl.reviewed_at::date = current_date;

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
    SELECT COUNT(DISTINCT s.entry_id) INTO v_total_success
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
    SELECT COUNT(*) INTO v_total_items FROM accessible_entries;

    RETURN jsonb_build_object(
        'today', v_today_count,
        'totalSuccess', v_total_success,
        'totalItems', v_total_items
    );
END;
$function$;

DROP FUNCTION IF EXISTS public.get_training_stats(uuid, text, uuid, text);

CREATE OR REPLACE FUNCTION public.get_training_stats(
    p_user_id uuid,
    p_mode text,
    p_list_id uuid DEFAULT NULL,
    p_list_type text DEFAULT 'curated'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
BEGIN
    RETURN get_training_stats(p_user_id, ARRAY[p_mode], p_list_id, p_list_type);
END;
$function$;

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
    SELECT COUNT(DISTINCT rl.word_id) INTO v_new_words_today
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

    v_new_cards_today := v_new_words_today;

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
    SELECT COUNT(DISTINCT s.entry_id) INTO v_total_words_learned
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

CREATE OR REPLACE FUNCTION public.get_scenario_stats(
    p_user_id uuid,
    p_scenario_id text,
    p_list_id uuid DEFAULT NULL,
    p_list_type text DEFAULT 'curated'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
    v_card_modes text[];
    v_graduation_threshold numeric;
    v_total int;
    v_learned int;
    v_in_progress int;
    v_new int;
BEGIN
    IF (select auth.uid()) IS NULL OR p_user_id IS DISTINCT FROM (select auth.uid()) THEN
        RAISE EXCEPTION 'unauthorized: user_id does not match authenticated user';
    END IF;

    SELECT card_modes, graduation_threshold
    INTO v_card_modes, v_graduation_threshold
    FROM training_scenarios WHERE id = p_scenario_id;

    IF v_card_modes IS NULL THEN
        RETURN jsonb_build_object('error', 'Scenario not found');
    END IF;

    WITH accessible_entries AS (
        SELECT w.id
        FROM word_entries w
        WHERE (w.dictionary_id IS NULL OR can_access_dictionary(p_user_id, w.dictionary_id, 'read'))
          AND (
                (p_list_id IS NULL AND w.is_nt2_2000 = true)
             OR (p_list_id IS NOT NULL AND p_list_type = 'curated' AND EXISTS (
                    SELECT 1 FROM word_list_items li WHERE li.list_id = p_list_id AND li.word_id = w.id
                ))
             OR (p_list_id IS NOT NULL AND p_list_type = 'user' AND EXISTS (
                    SELECT 1 FROM user_word_list_items li
                    JOIN user_word_lists l ON l.id = li.list_id
                    WHERE li.list_id = p_list_id AND li.word_id = w.id AND l.user_id = p_user_id
                ))
          )
    ),
    word_min_stability AS (
        SELECT
            ae.id as word_id,
            MIN(COALESCE(s.fsrs_stability, 0)) as min_stability,
            COUNT(s.entry_id) as cards_started
        FROM accessible_entries ae
        LEFT JOIN user_card_status s ON s.entry_id = ae.id
            AND s.user_id = p_user_id
            AND s.card_type_id = ANY(v_card_modes)
            AND s.fsrs_enabled = true
            AND s.hidden = false
        GROUP BY ae.id
    )
    SELECT
        COUNT(*),
        COUNT(*) FILTER (WHERE min_stability >= v_graduation_threshold AND cards_started >= array_length(v_card_modes, 1)),
        COUNT(*) FILTER (WHERE cards_started > 0 AND (min_stability < v_graduation_threshold OR cards_started < array_length(v_card_modes, 1))),
        COUNT(*) FILTER (WHERE cards_started = 0)
    INTO v_total, v_learned, v_in_progress, v_new
    FROM word_min_stability;

    RETURN jsonb_build_object(
        'learned', COALESCE(v_learned, 0),
        'in_progress', COALESCE(v_in_progress, 0),
        'new', COALESCE(v_new, 0),
        'total', COALESCE(v_total, 0),
        'scenario_id', p_scenario_id,
        'card_modes', v_card_modes,
        'graduation_threshold', v_graduation_threshold
    );
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_scenario_word_stats(
    p_user_id uuid,
    p_word_id uuid,
    p_scenario_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
    v_card_modes text[];
    v_result jsonb;
BEGIN
    IF (select auth.uid()) IS NULL OR p_user_id IS DISTINCT FROM (select auth.uid()) THEN
        RAISE EXCEPTION 'unauthorized: user_id does not match authenticated user';
    END IF;

    SELECT card_modes INTO v_card_modes
    FROM training_scenarios WHERE id = p_scenario_id;

    IF v_card_modes IS NULL THEN
        RETURN jsonb_build_object('error', 'Scenario not found');
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM word_entries w
        WHERE w.id = p_word_id
          AND (w.dictionary_id IS NULL OR can_access_dictionary(p_user_id, w.dictionary_id, 'read'))
    ) THEN
        RETURN jsonb_build_object(
            'min_stability', null, 'avg_stability', null, 'max_stability', null,
            'cards_started', 0, 'cards_total', array_length(v_card_modes, 1), 'is_learned', false
        );
    END IF;

    SELECT jsonb_build_object(
        'min_stability', MIN(s.fsrs_stability),
        'avg_stability', AVG(s.fsrs_stability),
        'max_stability', MAX(s.fsrs_stability),
        'cards_started', COUNT(s.entry_id),
        'cards_total', array_length(v_card_modes, 1),
        'is_learned', COALESCE(MIN(s.fsrs_stability), 0) >= (
            SELECT graduation_threshold FROM training_scenarios WHERE id = p_scenario_id
        )
    ) INTO v_result
    FROM user_card_status s
    WHERE s.user_id = p_user_id
      AND s.entry_id = p_word_id
      AND s.card_type_id = ANY(v_card_modes)
      AND s.fsrs_enabled = true
      AND s.hidden = false;

    RETURN COALESCE(v_result, jsonb_build_object(
        'min_stability', null, 'avg_stability', null, 'max_stability', null,
        'cards_started', 0, 'cards_total', array_length(v_card_modes, 1), 'is_learned', false
    ));
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_training_stats(uuid, text[], uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_training_stats(uuid, text, uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_detailed_training_stats(uuid, text[], uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_scenario_stats(uuid, text, uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_scenario_word_stats(uuid, uuid, text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_training_stats(uuid, text[], uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_training_stats(uuid, text, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_detailed_training_stats(uuid, text[], uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_scenario_stats(uuid, text, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_scenario_word_stats(uuid, uuid, text) TO authenticated;
