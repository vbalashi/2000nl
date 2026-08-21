-- Authoritative snapshot for Training session progress chrome.
--
-- This contract deliberately counts the bounded work the scheduler can plan
-- now. It does not derive a total from UI counters and does not change card
-- selection, queue ordering, or FSRS state.

BEGIN;

CREATE OR REPLACE FUNCTION public.get_training_session_plan(
    p_user_id uuid,
    p_card_type_ids text[] DEFAULT ARRAY['word-to-definition'::text],
    p_list_id uuid DEFAULT NULL::uuid,
    p_list_type text DEFAULT 'curated'::text,
    p_card_filter text DEFAULT 'both'::text,
    p_training_filter jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE
    v_card_type_ids text[] := CASE
        WHEN p_card_type_ids IS NULL
          OR array_length(p_card_type_ids, 1) IS NULL
            THEN ARRAY['word-to-definition'::text]
        ELSE p_card_type_ids
    END;
    v_filter jsonb := COALESCE(p_training_filter, '{}'::jsonb);
    v_timezone text := COALESCE(NULLIF(trim(v_filter->>'timezone'), ''), 'UTC');
    v_target_date date := private.training_filter_target_date(v_filter);
    v_source_id uuid;
    v_source_kind text := NULLIF(trim(v_filter->>'sourceKind'), '');
    v_external_id text := NULLIF(trim(v_filter->>'externalId'), '');
    v_filter_active boolean;
    v_daily_new_limit integer;
    v_daily_review_limit integer;
    v_new_today integer;
    v_reviews_today integer;
    v_new_candidates integer;
    v_review_candidates integer;
    v_planned_new integer;
    v_planned_review integer;
    v_list_valid boolean := true;
BEGIN
    IF (select auth.uid()) IS NULL
       OR p_user_id IS DISTINCT FROM (select auth.uid()) THEN
        RAISE EXCEPTION 'unauthorized: user_id does not match authenticated user';
    END IF;

    IF p_card_filter NOT IN ('new', 'review', 'both') THEN
        RAISE EXCEPTION 'invalid card filter: %', p_card_filter;
    END IF;

    SELECT COALESCE(
        array_agg(mode.card_type_id ORDER BY mode.card_type_id),
        ARRAY['word-to-definition'::text]
    )
    INTO v_card_type_ids
    FROM (
        SELECT DISTINCT NULLIF(trim(value), '') AS card_type_id
        FROM unnest(v_card_type_ids) AS requested(value)
    ) mode
    WHERE mode.card_type_id IS NOT NULL;

    IF p_list_id IS NOT NULL THEN
        p_list_type := COALESCE(p_list_type, 'curated');
        IF p_list_type = 'user' THEN
            SELECT EXISTS (
                SELECT 1
                FROM public.user_word_lists list
                WHERE list.id = p_list_id
                  AND list.user_id = p_user_id
            ) INTO v_list_valid;
        ELSIF p_list_type = 'curated' THEN
            SELECT EXISTS (
                SELECT 1 FROM public.word_lists list WHERE list.id = p_list_id
            ) INTO v_list_valid;
        ELSE
            v_list_valid := false;
        END IF;
    END IF;

    IF NOT v_list_valid THEN
        RETURN jsonb_build_object(
            'plannedNew', 0,
            'plannedReview', 0,
            'plannedTotal', 0,
            'plannedAt', clock_timestamp()
        );
    END IF;

    BEGIN
        v_source_id := NULLIF(v_filter->>'sourceId', '')::uuid;
    EXCEPTION WHEN others THEN
        v_source_id := NULL;
    END;
    v_filter_active :=
        v_target_date IS NOT NULL
        OR v_source_id IS NOT NULL
        OR v_source_kind IS NOT NULL
        OR v_external_id IS NOT NULL;

    SELECT
        COALESCE(settings.daily_new_limit, 10),
        COALESCE(settings.daily_review_limit, 200)
    INTO v_daily_new_limit, v_daily_review_limit
    FROM public.user_settings settings
    WHERE settings.user_id = p_user_id;
    v_daily_new_limit := COALESCE(v_daily_new_limit, 10);
    v_daily_review_limit := COALESCE(v_daily_review_limit, 200);

    SELECT COUNT(DISTINCT log.word_id)
    INTO v_new_today
    FROM public.user_review_log log
    WHERE log.user_id = p_user_id
      AND log.mode = ANY(v_card_type_ids)
      AND log.review_type = 'new'
      AND log.reviewed_at::date = current_date;

    SELECT COUNT(*)
    INTO v_reviews_today
    FROM public.user_review_log log
    WHERE log.user_id = p_user_id
      AND log.mode = ANY(v_card_type_ids)
      AND log.review_type = 'review'
      AND log.reviewed_at::date = current_date;

    WITH scope_entries AS (
        SELECT entry.id
        FROM public.word_entries entry
        WHERE NOT private.is_pointer_only_dictionary_entry_v1(entry.raw)
          AND (
                entry.dictionary_id IS NULL
                OR public.can_access_dictionary(
                    p_user_id,
                    entry.dictionary_id,
                    'read'
                )
          )
          AND (
                (p_list_id IS NULL AND entry.is_nt2_2000 = true)
             OR (p_list_id IS NOT NULL AND p_list_type = 'curated' AND EXISTS (
                    SELECT 1
                    FROM public.word_list_items item
                    WHERE item.list_id = p_list_id
                      AND item.word_id = entry.id
                ))
             OR (p_list_id IS NOT NULL AND p_list_type = 'user' AND EXISTS (
                    SELECT 1
                    FROM public.user_word_list_items item
                    JOIN public.user_word_lists list ON list.id = item.list_id
                    WHERE item.list_id = p_list_id
                      AND item.word_id = entry.id
                      AND list.user_id = p_user_id
                ))
          )
    ),
    matched_cards AS (
        SELECT DISTINCT event.entry_id, event.card_type_id
        FROM public.user_card_action_events event
        LEFT JOIN public.learning_sources source ON source.id = event.source_id
        WHERE event.user_id = p_user_id
          AND event.card_type_id = ANY(v_card_type_ids)
          AND (
                v_target_date IS NULL
                OR private.training_filter_local_date(
                    event.created_at,
                    v_timezone
                ) = v_target_date
          )
          AND (v_source_id IS NULL OR event.source_id = v_source_id)
          AND (
                v_source_kind IS NULL
             OR source.kind = v_source_kind
             OR source.provider = v_source_kind
             OR (
                    v_source_kind = 'youtube'
                    AND (
                        source.kind IN ('youtube', 'youtube_video')
                        OR source.provider = 'youtube'
                    )
                )
          )
          AND (v_external_id IS NULL OR source.external_id = v_external_id)
    ),
    candidate_cards AS (
        SELECT
            scope.id AS entry_id,
            mode.card_type_id,
            status.fsrs_enabled,
            status.fsrs_last_interval,
            status.next_review_at,
            status.hidden,
            status.frozen_until,
            status.entry_id IS NOT NULL AS has_status,
            matched.entry_id IS NOT NULL AS matches_filter
        FROM scope_entries scope
        CROSS JOIN unnest(v_card_type_ids) AS mode(card_type_id)
        LEFT JOIN public.user_card_status status
          ON status.user_id = p_user_id
         AND status.entry_id = scope.id
         AND status.card_type_id = mode.card_type_id
        LEFT JOIN matched_cards matched
          ON matched.entry_id = scope.id
         AND matched.card_type_id = mode.card_type_id
        WHERE NOT EXISTS (
            SELECT 1
            FROM public.user_card_known_marks known
            WHERE known.user_id = p_user_id
              AND known.entry_id = scope.id
              AND known.card_type_id = mode.card_type_id
              AND known.cleared_at IS NULL
        )
    )
    SELECT
        COUNT(DISTINCT entry_id) FILTER (
            WHERE (
                (NOT v_filter_active AND NOT has_status)
                OR (
                    v_filter_active
                    AND matches_filter
                    AND has_status
                    AND COALESCE(hidden, false) = false
                    AND (frozen_until IS NULL OR frozen_until <= now())
                    AND COALESCE(fsrs_enabled, false) = false
                )
            )
        ),
        COUNT(*) FILTER (
            WHERE has_status
              AND (NOT v_filter_active OR matches_filter)
              AND COALESCE(hidden, false) = false
              AND (frozen_until IS NULL OR frozen_until <= now())
              AND fsrs_enabled = true
              AND next_review_at <= now()
        )
    INTO v_new_candidates, v_review_candidates
    FROM candidate_cards;

    v_planned_new := CASE
        WHEN p_card_filter = 'review' THEN 0
        ELSE LEAST(
            COALESCE(v_new_candidates, 0),
            GREATEST(0, v_daily_new_limit - COALESCE(v_new_today, 0))
        )
    END;
    v_planned_review := CASE
        WHEN p_card_filter = 'new' THEN 0
        ELSE LEAST(
            COALESCE(v_review_candidates, 0),
            GREATEST(0, v_daily_review_limit - COALESCE(v_reviews_today, 0))
        )
    END;

    RETURN jsonb_build_object(
        'plannedNew', v_planned_new,
        'plannedReview', v_planned_review,
        'plannedTotal', v_planned_new + v_planned_review,
        'plannedAt', clock_timestamp()
    );
END;
$$;

REVOKE ALL ON FUNCTION public.get_training_session_plan(
    uuid, text[], uuid, text, text, jsonb
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_training_session_plan(
    uuid, text[], uuid, text, text, jsonb
) TO authenticated;

COMMIT;
