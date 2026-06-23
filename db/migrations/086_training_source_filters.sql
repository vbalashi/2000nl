-- Focused training filters over existing source/provenance action events.
--
-- This intentionally adds a filtered queue beside the broad scheduler instead
-- of changing get_next_card selection semantics for normal training.

CREATE OR REPLACE FUNCTION private.training_filter_local_date(
    p_timestamp timestamptz,
    p_timezone text
)
RETURNS date
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
    RETURN (p_timestamp AT TIME ZONE COALESCE(NULLIF(trim(p_timezone), ''), 'UTC'))::date;
EXCEPTION WHEN others THEN
    RETURN (p_timestamp AT TIME ZONE 'UTC')::date;
END;
$$;

CREATE OR REPLACE FUNCTION private.training_filter_target_date(
    p_filter jsonb
)
RETURNS date
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    v_timezone text := COALESCE(NULLIF(trim(p_filter->>'timezone'), ''), 'UTC');
    v_window text := COALESCE(NULLIF(trim(p_filter->>'dateWindow'), ''), 'all');
    v_days_ago int;
    v_today date;
BEGIN
    v_today := private.training_filter_local_date(now(), v_timezone);

    IF v_window = 'today' THEN
        RETURN v_today;
    END IF;
    IF v_window = 'yesterday' THEN
        RETURN v_today - 1;
    END IF;
    IF v_window = 'daysAgo' THEN
        v_days_ago := GREATEST(0, LEAST(365, COALESCE(NULLIF(p_filter->>'daysAgo', '')::int, 0)));
        RETURN v_today - v_days_ago;
    END IF;

    RETURN NULL;
EXCEPTION WHEN others THEN
    RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_training_filter_sources(
    p_user_id uuid,
    p_limit integer DEFAULT 50
)
RETURNS SETOF jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
BEGIN
    IF (select auth.uid()) IS NULL OR p_user_id IS DISTINCT FROM (select auth.uid()) THEN
        RAISE EXCEPTION 'unauthorized: user_id does not match authenticated user';
    END IF;

    RETURN QUERY
    SELECT jsonb_build_object(
        'sourceId', s.id,
        'kind', s.kind,
        'provider', s.provider,
        'externalId', s.external_id,
        'title', s.title,
        'label',
            CASE
                WHEN s.kind IN ('youtube', 'youtube_video') OR s.provider = 'youtube'
                    THEN 'YouTube · ' || COALESCE(NULLIF(s.title, ''), NULLIF(s.external_id, ''), 'Untitled video')
                ELSE COALESCE(NULLIF(s.title, ''), NULLIF(s.external_id, ''), s.kind)
            END,
        'eventCount', COUNT(e.id),
        'lastSeenAt', MAX(e.created_at)
    )
    FROM user_card_action_events e
    JOIN learning_sources s ON s.id = e.source_id
    WHERE e.user_id = p_user_id
    GROUP BY s.id, s.kind, s.provider, s.external_id, s.title
    ORDER BY MAX(e.created_at) DESC
    LIMIT GREATEST(1, LEAST(200, COALESCE(p_limit, 50)));
END;
$$;

CREATE OR REPLACE FUNCTION public.get_next_filtered_card(
    p_user_id uuid,
    p_card_type_ids text[] DEFAULT ARRAY['word-to-definition'::text],
    p_exclude_entry_ids uuid[] DEFAULT ARRAY[]::uuid[],
    p_list_id uuid DEFAULT NULL::uuid,
    p_list_type text DEFAULT 'curated'::text,
    p_card_filter text DEFAULT 'both'::text,
    p_queue_turn text DEFAULT 'auto'::text,
    p_exclude_card_keys text[] DEFAULT ARRAY[]::text[],
    p_training_filter jsonb DEFAULT '{}'::jsonb
)
RETURNS SETOF jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE
    v_word_id uuid;
    v_selected_mode text;
    v_source text;
    v_settings record;
    v_new_today int;
    v_reviews_today int;
    v_list_valid boolean := true;
    v_new_pool_size int;
    v_review_pool_size int;
    v_learning_due_count int;
    v_review_pool_limit int := 10;
    v_filter jsonb := COALESCE(p_training_filter, '{}'::jsonb);
    v_timezone text := COALESCE(NULLIF(trim(v_filter->>'timezone'), ''), 'UTC');
    v_target_date date := private.training_filter_target_date(v_filter);
    v_source_id uuid;
    v_source_kind text := NULLIF(trim(v_filter->>'sourceKind'), '');
    v_external_id text := NULLIF(trim(v_filter->>'externalId'), '');
BEGIN
    IF (select auth.uid()) IS NULL OR p_user_id IS DISTINCT FROM (select auth.uid()) THEN
        RAISE EXCEPTION 'unauthorized: user_id does not match authenticated user';
    END IF;

    IF p_card_type_ids IS NULL OR array_length(p_card_type_ids, 1) IS NULL THEN
        p_card_type_ids := ARRAY['word-to-definition'];
    END IF;
    p_exclude_entry_ids := COALESCE(p_exclude_entry_ids, ARRAY[]::uuid[]);
    p_exclude_card_keys := COALESCE(p_exclude_card_keys, ARRAY[]::text[]);

    BEGIN
        v_source_id := NULLIF(v_filter->>'sourceId', '')::uuid;
    EXCEPTION WHEN others THEN
        v_source_id := NULL;
    END;

    IF p_list_id IS NOT NULL THEN
        IF p_list_type IS NULL THEN
            p_list_type := 'curated';
        END IF;

        IF p_list_type = 'user' THEN
            SELECT EXISTS (
                SELECT 1 FROM user_word_lists
                WHERE id = p_list_id AND user_id = p_user_id
            ) INTO v_list_valid;
        ELSE
            SELECT EXISTS (
                SELECT 1 FROM word_lists WHERE id = p_list_id
            ) INTO v_list_valid;
        END IF;

        IF NOT v_list_valid THEN
            RETURN;
        END IF;
    END IF;

    SELECT * INTO v_settings
    FROM user_settings
    WHERE user_id = p_user_id;

    v_settings.daily_new_limit := COALESCE(v_settings.daily_new_limit, 10);
    v_settings.daily_review_limit := COALESCE(v_settings.daily_review_limit, 200);

    SELECT COUNT(DISTINCT word_id) INTO v_new_today
    FROM user_review_log
    WHERE user_id = p_user_id
      AND mode = ANY(p_card_type_ids)
      AND review_type = 'new'
      AND reviewed_at::date = current_date;

    SELECT COUNT(*) INTO v_reviews_today
    FROM user_review_log
    WHERE user_id = p_user_id
      AND mode = ANY(p_card_type_ids)
      AND review_type = 'review'
      AND reviewed_at::date = current_date;

    WITH matched_cards AS (
        SELECT DISTINCT e.entry_id, e.card_type_id
        FROM user_card_action_events e
        LEFT JOIN learning_sources src ON src.id = e.source_id
        WHERE e.user_id = p_user_id
          AND e.card_type_id = ANY(p_card_type_ids)
          AND (v_target_date IS NULL OR private.training_filter_local_date(e.created_at, v_timezone) = v_target_date)
          AND (v_source_id IS NULL OR e.source_id = v_source_id)
          AND (
                v_source_kind IS NULL
             OR src.kind = v_source_kind
             OR src.provider = v_source_kind
             OR (v_source_kind = 'youtube' AND (src.kind IN ('youtube', 'youtube_video') OR src.provider = 'youtube'))
          )
          AND (v_external_id IS NULL OR src.external_id = v_external_id)
    ),
    eligible AS (
        SELECT s.*
        FROM user_card_status s
        JOIN word_entries w ON w.id = s.entry_id
        JOIN matched_cards mc ON mc.entry_id = s.entry_id AND mc.card_type_id = s.card_type_id
        WHERE s.user_id = p_user_id
          AND s.card_type_id = ANY(p_card_type_ids)
          AND (s.frozen_until IS NULL OR s.frozen_until <= now())
          AND s.hidden = false
          AND (w.dictionary_id IS NULL OR can_access_dictionary(p_user_id, w.dictionary_id, 'read'))
          AND NOT (s.entry_id = ANY(p_exclude_entry_ids))
          AND NOT ((s.entry_id::text || ':' || s.card_type_id) = ANY(p_exclude_card_keys))
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
    SELECT
        COUNT(*) FILTER (WHERE COALESCE(fsrs_last_interval, 0) < 1.0 AND fsrs_enabled = true AND next_review_at <= now()),
        COUNT(*) FILTER (WHERE fsrs_last_interval >= 1.0 AND fsrs_enabled = true AND next_review_at <= now()),
        COUNT(*) FILTER (WHERE fsrs_enabled = false OR fsrs_enabled IS NULL)
    INTO v_learning_due_count, v_review_pool_size, v_new_pool_size
    FROM eligible;

    WITH matched_events AS (
        SELECT DISTINCT ON (e.entry_id, e.card_type_id)
            e.entry_id,
            e.card_type_id,
            e.created_at,
            e.source_id,
            e.artifact_id
        FROM user_card_action_events e
        LEFT JOIN learning_sources src ON src.id = e.source_id
        WHERE e.user_id = p_user_id
          AND e.card_type_id = ANY(p_card_type_ids)
          AND (v_target_date IS NULL OR private.training_filter_local_date(e.created_at, v_timezone) = v_target_date)
          AND (v_source_id IS NULL OR e.source_id = v_source_id)
          AND (
                v_source_kind IS NULL
             OR src.kind = v_source_kind
             OR src.provider = v_source_kind
             OR (v_source_kind = 'youtube' AND (src.kind IN ('youtube', 'youtube_video') OR src.provider = 'youtube'))
          )
          AND (v_external_id IS NULL OR src.external_id = v_external_id)
        ORDER BY e.entry_id, e.card_type_id, e.created_at DESC
    ),
    candidates AS (
        SELECT
            s.entry_id,
            s.card_type_id,
            me.created_at AS latest_event_at,
            CASE
                WHEN s.fsrs_enabled = true AND s.fsrs_last_interval >= 1.0 AND s.next_review_at <= now() THEN 'review'
                WHEN s.fsrs_enabled = true AND COALESCE(s.fsrs_last_interval, 0) < 1.0 AND s.next_review_at <= now() THEN 'learning'
                WHEN COALESCE(s.fsrs_enabled, false) = false THEN 'new'
                ELSE 'practice'
            END AS queue_source,
            CASE
                WHEN s.fsrs_enabled = true AND s.fsrs_last_interval >= 1.0 AND s.next_review_at <= now() THEN 1
                WHEN s.fsrs_enabled = true AND COALESCE(s.fsrs_last_interval, 0) < 1.0 AND s.next_review_at <= now() THEN 2
                WHEN COALESCE(s.fsrs_enabled, false) = false THEN 3
                ELSE 4
            END AS source_rank
        FROM user_card_status s
        JOIN word_entries w ON w.id = s.entry_id
        JOIN matched_events me ON me.entry_id = s.entry_id AND me.card_type_id = s.card_type_id
        WHERE s.user_id = p_user_id
          AND s.card_type_id = ANY(p_card_type_ids)
          AND (s.frozen_until IS NULL OR s.frozen_until <= now())
          AND s.hidden = false
          AND (w.dictionary_id IS NULL OR can_access_dictionary(p_user_id, w.dictionary_id, 'read'))
          AND NOT (s.entry_id = ANY(p_exclude_entry_ids))
          AND NOT ((s.entry_id::text || ':' || s.card_type_id) = ANY(p_exclude_card_keys))
          AND (
                p_card_filter = 'both'
             OR (p_card_filter = 'review' AND s.fsrs_enabled = true)
             OR (p_card_filter = 'new' AND COALESCE(s.fsrs_enabled, false) = false)
          )
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
    SELECT entry_id, card_type_id, queue_source
    INTO v_word_id, v_selected_mode, v_source
    FROM candidates
    ORDER BY
        CASE
            WHEN p_queue_turn = 'review' AND queue_source IN ('review', 'learning') THEN 0
            WHEN p_queue_turn = 'new' AND queue_source = 'new' THEN 0
            ELSE source_rank
        END,
        latest_event_at DESC
    LIMIT 1;

    IF v_word_id IS NOT NULL THEN
        RETURN QUERY
        SELECT jsonb_build_object(
            'id', w.id,
            'dictionary_id', w.dictionary_id,
            'language_code', w.language_code,
            'headword', w.headword,
            'part_of_speech', w.part_of_speech,
            'gender', w.gender,
            'raw', w.raw,
            'vandaleId', w.vandale_id,
            'is_nt2_2000', w.is_nt2_2000,
            'meanings_count', (
                SELECT COUNT(*) FROM word_entries we
                WHERE we.headword = w.headword
                  AND we.language_code = w.language_code
                  AND (
                        (w.dictionary_id IS NULL AND we.dictionary_id IS NULL)
                     OR we.dictionary_id = w.dictionary_id
                  )
            ),
            'mode', v_selected_mode,
            'stats', jsonb_build_object(
                'source', v_source,
                'mode', v_selected_mode,
                'next_review', s.next_review_at,
                'interval', s.fsrs_last_interval,
                'reps', s.fsrs_reps,
                'stability', s.fsrs_stability,
                'difficulty', s.fsrs_difficulty,
                'clicks', s.click_count,
                'new_today', v_new_today,
                'daily_new_limit', v_settings.daily_new_limit,
                'new_pool_size', v_new_pool_size,
                'learning_due_count', v_learning_due_count,
                'review_pool_size', LEAST(v_review_pool_size, v_review_pool_limit),
                'reason', 'filtered',
                'training_filter', v_filter
            )
        )
        FROM word_entries w
        LEFT JOIN user_card_status s ON s.entry_id = w.id AND s.user_id = p_user_id AND s.card_type_id = v_selected_mode
        WHERE w.id = v_word_id
          AND (w.dictionary_id IS NULL OR can_access_dictionary(p_user_id, w.dictionary_id, 'read'));
    END IF;

    RETURN;
END;
$$;

ALTER FUNCTION public.get_training_filter_sources(uuid, integer) SET search_path = public, private, pg_temp;
ALTER FUNCTION public.get_next_filtered_card(uuid, text[], uuid[], uuid, text, text, text, text[], jsonb) SET search_path = public, private, pg_temp;

REVOKE EXECUTE ON FUNCTION public.get_training_filter_sources(uuid, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_next_filtered_card(uuid, text[], uuid[], uuid, text, text, text, text[], jsonb) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_training_filter_sources(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_next_filtered_card(uuid, text[], uuid[], uuid, text, text, text, text[], jsonb) TO authenticated;

