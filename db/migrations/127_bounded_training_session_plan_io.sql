-- Keep the default training-session plan inside a bounded cold-I/O footprint.
-- The selector still owns card ordering. The plan only counts each queue, so it
-- resolves learner sets once and avoids executing selector-only ordering work.

BEGIN;

CREATE TABLE IF NOT EXISTS private.default_training_scope_entries_v1 (
  entry_id uuid PRIMARY KEY
    REFERENCES public.word_entries(id) ON DELETE CASCADE,
  dictionary_id uuid
);

REVOKE ALL ON TABLE private.default_training_scope_entries_v1
FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION private.sync_default_training_scope_entry_v1()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
BEGIN
  IF NEW.is_nt2_2000 = true
     AND NOT private.is_pointer_only_dictionary_entry_v1(NEW.raw) THEN
    INSERT INTO private.default_training_scope_entries_v1(entry_id, dictionary_id)
    VALUES (NEW.id, NEW.dictionary_id)
    ON CONFLICT (entry_id) DO UPDATE
    SET dictionary_id = EXCLUDED.dictionary_id;
  ELSE
    DELETE FROM private.default_training_scope_entries_v1
    WHERE entry_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.sync_default_training_scope_entry_v1()
FROM PUBLIC, anon, authenticated, service_role;

-- Hold source writes from the first synchronization snapshot until the trigger
-- is visible at commit. Readers remain available throughout the migration.
LOCK TABLE public.word_entries IN SHARE ROW EXCLUSIVE MODE;

DROP TRIGGER IF EXISTS sync_default_training_scope_entry_v1
ON public.word_entries;
CREATE TRIGGER sync_default_training_scope_entry_v1
AFTER INSERT OR UPDATE OF is_nt2_2000, raw, dictionary_id
ON public.word_entries
FOR EACH ROW
EXECUTE FUNCTION private.sync_default_training_scope_entry_v1();

INSERT INTO private.default_training_scope_entries_v1(entry_id, dictionary_id)
SELECT entry.id, entry.dictionary_id
FROM public.word_entries entry
WHERE entry.is_nt2_2000 = true
  AND NOT private.is_pointer_only_dictionary_entry_v1(entry.raw)
ON CONFLICT (entry_id) DO UPDATE
SET dictionary_id = EXCLUDED.dictionary_id;

DELETE FROM private.default_training_scope_entries_v1 scope_entry
WHERE NOT EXISTS (
  SELECT 1
  FROM public.word_entries entry
  WHERE entry.id = scope_entry.entry_id
    AND entry.is_nt2_2000 = true
    AND NOT private.is_pointer_only_dictionary_entry_v1(entry.raw)
);

CREATE OR REPLACE FUNCTION private.default_training_session_plan_counts_v1(
  p_user_id uuid,
  p_card_type_ids text[],
  p_list_type text,
  p_card_filter text,
  p_training_filter jsonb
)
RETURNS TABLE(
  planned_new bigint,
  planned_review bigint,
  planned_practice bigint
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, private, pg_temp
AS $$
WITH args AS (
  SELECT CASE
      WHEN p_card_type_ids IS NULL OR cardinality(p_card_type_ids) = 0
        THEN ARRAY['word-to-definition']::text[]
      ELSE ARRAY(
        SELECT DISTINCT trim(mode)
        FROM unnest(p_card_type_ids) requested(mode)
        WHERE trim(mode) <> ''
        ORDER BY 1
      )
    END AS modes,
    COALESCE(p_training_filter, '{}') AS filter_data,
    COALESCE(p_list_type, 'curated') AS list_type
), limits AS MATERIALIZED (
  SELECT COALESCE(settings.daily_new_limit, 10)::bigint AS new_limit,
    COALESCE(settings.daily_review_limit, 200)::bigint AS review_limit
  FROM (SELECT 1) seed
  LEFT JOIN user_settings settings ON settings.user_id = p_user_id
), daily AS MATERIALIZED (
  SELECT count(DISTINCT log.word_id) FILTER (WHERE log.review_type = 'new') AS new_today,
    count(*) FILTER (WHERE log.review_type = 'review') AS review_today
  FROM user_review_log log, args
  WHERE log.user_id = p_user_id
    AND log.mode = ANY(args.modes)
    AND log.reviewed_at::date = current_date
), readable_dictionaries AS MATERIALIZED (
  SELECT dictionary.id
  FROM dictionaries dictionary
  WHERE can_access_dictionary(p_user_id, dictionary.id, 'read')
), scope AS MATERIALIZED (
  SELECT scope_entry.entry_id AS id
  FROM private.default_training_scope_entries_v1 scope_entry
  LEFT JOIN readable_dictionaries readable_dictionary
    ON readable_dictionary.id = scope_entry.dictionary_id
  WHERE scope_entry.dictionary_id IS NULL OR readable_dictionary.id IS NOT NULL
), modes AS MATERIALIZED (
  SELECT requested_mode.card_type_id
  FROM args
  CROSS JOIN unnest(args.modes) requested_mode(card_type_id)
), today_new_words AS MATERIALIZED (
  SELECT DISTINCT log.word_id
  FROM user_review_log log, args
  WHERE log.user_id = p_user_id
    AND log.mode = ANY(args.modes)
    AND log.review_type = 'new'
    AND log.reviewed_at::date = current_date
), today_new_cards AS MATERIALIZED (
  SELECT DISTINCT log.word_id, log.mode AS card_type_id
  FROM user_review_log log, args
  WHERE log.user_id = p_user_id
    AND log.mode = ANY(args.modes)
    AND log.review_type = 'new'
    AND log.reviewed_at::date = current_date
), known_cards AS MATERIALIZED (
  SELECT known.entry_id, known.card_type_id
  FROM user_card_known_marks known, args
  WHERE known.user_id = p_user_id
    AND known.card_type_id = ANY(args.modes)
    AND known.cleared_at IS NULL
), learner_status AS MATERIALIZED (
  SELECT status.*
  FROM user_card_status status, args
  WHERE status.user_id = p_user_id
    AND status.card_type_id = ANY(args.modes)
), cards AS MATERIALIZED (
  SELECT scope.id AS entry_id,
    modes.card_type_id,
    status.fsrs_enabled,
    status.fsrs_last_interval,
    status.next_review_at,
    today_new_words.word_id IS NOT NULL AS new_seen_today,
    today_new_cards.word_id IS NOT NULL AS new_card_seen_today,
    CASE
      WHEN status.fsrs_enabled = true AND COALESCE(status.fsrs_last_interval, 0) < 1
        AND status.next_review_at <= now() THEN 'learning'
      WHEN status.fsrs_enabled = true AND status.fsrs_last_interval >= 1
        AND status.next_review_at <= now() THEN 'review'
      WHEN status.entry_id IS NULL OR COALESCE(status.fsrs_enabled, false) = false THEN 'new'
      ELSE 'practice'
    END AS intrinsic_source
  FROM scope
  CROSS JOIN modes
  LEFT JOIN learner_status status ON status.entry_id = scope.id
    AND status.card_type_id = modes.card_type_id
  LEFT JOIN today_new_words ON today_new_words.word_id = scope.id
  LEFT JOIN today_new_cards ON today_new_cards.word_id = scope.id
    AND today_new_cards.card_type_id = modes.card_type_id
  LEFT JOIN known_cards ON known_cards.entry_id = scope.id
    AND known_cards.card_type_id = modes.card_type_id
  WHERE known_cards.entry_id IS NULL
    AND COALESCE(status.hidden, false) = false
    AND (status.frozen_until IS NULL OR status.frozen_until <= now())
    AND (status.entry_id IS NULL OR status.fsrs_enabled = true)
), cohort_context AS (
  SELECT md5(concat_ws('|',
    p_user_id::text,
    array_to_string(args.modes, ','),
    '',
    args.list_type,
    p_card_filter,
    args.filter_data::text
  )) AS cohort_seed
  FROM args
), unseen_word_ranks AS MATERIALIZED (
  SELECT unseen.entry_id,
    row_number() OVER (
      ORDER BY md5(cohort_context.cohort_seed || ':' || unseen.entry_id::text)
    ) AS new_word_ordinal,
    count(*) OVER () AS new_word_count
  FROM (
    SELECT DISTINCT entry_id
    FROM cards
    WHERE intrinsic_source = 'new' AND NOT new_seen_today
  ) unseen
  CROSS JOIN cohort_context
), classified AS MATERIALIZED (
  SELECT cards.*,
    unseen_word_ranks.new_word_ordinal,
    COALESCE((SELECT max(new_word_count) FROM unseen_word_ranks), 0)::bigint AS new_word_count,
    GREATEST(0, limits.new_limit - COALESCE(daily.new_today, 0))::bigint AS new_remaining,
    GREATEST(0, limits.review_limit - COALESCE(daily.review_today, 0))::bigint AS review_remaining,
    limits.new_limit,
    limits.review_limit,
    COALESCE(daily.new_today, 0)::bigint AS new_today,
    COALESCE(daily.review_today, 0)::bigint AS review_today
  FROM cards
  LEFT JOIN unseen_word_ranks ON unseen_word_ranks.entry_id = cards.entry_id
  CROSS JOIN limits
  CROSS JOIN daily
), totals AS (
  SELECT count(*)::bigint AS eligible_count,
    count(*) FILTER (
      WHERE intrinsic_source = 'learning' AND p_card_filter = 'both'
    )::bigint AS learning_selected,
    CASE WHEN p_card_filter <> 'new' THEN LEAST(
      count(*) FILTER (WHERE intrinsic_source = 'review'),
      COALESCE(max(review_remaining), 0)
    ) ELSE 0 END::bigint AS review_selected,
    count(*) FILTER (
      WHERE intrinsic_source = 'new'
        AND p_card_filter <> 'review'
        AND ((new_seen_today AND NOT new_card_seen_today)
          OR new_word_ordinal <= new_remaining)
    )::bigint AS new_selected,
    COALESCE(max(new_word_count), 0)::bigint AS new_word_count,
    count(*) FILTER (WHERE intrinsic_source = 'review')::bigint AS review_count,
    COALESCE(max(new_remaining), 0)::bigint AS new_remaining,
    COALESCE(max(review_remaining), 0)::bigint AS review_remaining,
    COALESCE(max(new_limit), 10)::bigint AS new_limit,
    COALESCE(max(review_limit), 200)::bigint AS review_limit,
    COALESCE(max(new_today), 0)::bigint AS new_today,
    COALESCE(max(review_today), 0)::bigint AS review_today
  FROM classified
)
SELECT totals.new_selected,
  totals.review_selected + totals.learning_selected,
  CASE WHEN p_card_filter <> 'both' OR NOT (
      totals.new_today + LEAST(totals.new_word_count, totals.new_remaining) >= totals.new_limit
      AND totals.review_today + LEAST(totals.review_count, totals.review_remaining) >= totals.review_limit
    )
    THEN totals.eligible_count - totals.new_selected
      - totals.review_selected - totals.learning_selected
    ELSE 0
  END
FROM totals;
$$;

REVOKE ALL ON FUNCTION private.default_training_session_plan_counts_v1(
  uuid, text[], text, text, jsonb
) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_training_session_plan(
  p_user_id uuid,
  p_card_type_ids text[] DEFAULT ARRAY['word-to-definition'],
  p_list_id uuid DEFAULT NULL,
  p_list_type text DEFAULT 'curated',
  p_card_filter text DEFAULT 'both',
  p_training_filter jsonb DEFAULT '{}'
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE
  filter_data jsonb := COALESCE(p_training_filter, '{}');
  filtered boolean;
  valid boolean := true;
  planned_new bigint;
  planned_review bigint;
  planned_practice bigint;
BEGIN
  IF (select auth.uid()) IS NULL OR p_user_id IS DISTINCT FROM (select auth.uid()) THEN
    RAISE EXCEPTION 'unauthorized: user_id does not match authenticated user';
  END IF;
  IF p_card_filter NOT IN ('new', 'review', 'both') THEN
    RAISE EXCEPTION 'invalid card filter: %', p_card_filter;
  END IF;
  IF p_list_id IS NOT NULL THEN
    IF COALESCE(p_list_type, 'curated') = 'user' THEN
      SELECT EXISTS(
        SELECT 1 FROM user_word_lists list
        WHERE list.id = p_list_id AND list.user_id = p_user_id
      ) INTO valid;
    ELSIF COALESCE(p_list_type, 'curated') = 'curated' THEN
      SELECT EXISTS(SELECT 1 FROM word_lists list WHERE list.id = p_list_id) INTO valid;
    ELSE
      valid := false;
    END IF;
  END IF;
  IF NOT valid THEN
    RETURN jsonb_build_object(
      'plannedNew', 0, 'plannedReview', 0, 'plannedPractice', 0,
      'plannedTotal', 0, 'plannedAt', clock_timestamp()
    );
  END IF;
  filtered := private.training_filter_target_date(filter_data) IS NOT NULL
    OR NULLIF(filter_data ->> 'sourceId', '') IS NOT NULL
    OR NULLIF(trim(filter_data ->> 'sourceKind'), '') IS NOT NULL
    OR NULLIF(trim(filter_data ->> 'externalId'), '') IS NOT NULL;

  IF p_list_id IS NULL AND NOT filtered THEN
    SELECT counts.planned_new, counts.planned_review, counts.planned_practice
    INTO planned_new, planned_review, planned_practice
    FROM private.default_training_session_plan_counts_v1(
      p_user_id, p_card_type_ids, p_list_type, p_card_filter, filter_data
    ) counts;
  ELSE
    SELECT count(*) FILTER (WHERE queue_source = 'new'),
      count(*) FILTER (WHERE queue_source IN ('learning', 'review')),
      count(*) FILTER (WHERE queue_source = 'practice')
    INTO planned_new, planned_review, planned_practice
    FROM private.training_scheduler_candidates_v1(
      p_user_id, p_card_type_ids, p_list_id, p_list_type,
      p_card_filter, 'auto', ARRAY[]::uuid[], ARRAY[]::text[], filter_data, filtered
    );
  END IF;

  planned_new := COALESCE(planned_new, 0);
  planned_review := COALESCE(planned_review, 0);
  planned_practice := COALESCE(planned_practice, 0);
  RETURN jsonb_build_object(
    'plannedNew', planned_new,
    'plannedReview', planned_review,
    'plannedPractice', planned_practice,
    'plannedTotal', planned_new + planned_review + planned_practice,
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
