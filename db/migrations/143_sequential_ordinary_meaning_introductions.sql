-- Introduce ordinary source meanings in dictionary order, one meaning at a
-- time.  The next meaning becomes offerable at the next local midnight after
-- an accepted Learn or Known decision on its predecessor.  This is an
-- introduction policy only: existing directional FSRS/review state remains
-- eligible under the ordinary scheduler path.

BEGIN;

ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS training_schedule_timezone text NOT NULL DEFAULT 'UTC';

CREATE OR REPLACE FUNCTION private.training_schedule_timezone_v1(
  p_timezone text
)
RETURNS text
LANGUAGE plpgsql
STABLE
SET search_path = public, private, pg_temp
AS $$
DECLARE
  v_timezone text := COALESCE(NULLIF(trim(p_timezone), ''), 'UTC');
BEGIN
  -- Ask PostgreSQL to resolve the IANA name now.  A malformed client value
  -- must not make scheduler eligibility error or become durable state.
  PERFORM now() AT TIME ZONE v_timezone;
  RETURN v_timezone;
EXCEPTION WHEN others THEN
  RETURN 'UTC';
END;
$$;

CREATE OR REPLACE FUNCTION private.next_ordinary_meaning_available_at_v1(
  p_activated_at timestamptz,
  p_timezone text
)
RETURNS timestamptz
LANGUAGE sql
STABLE
SET search_path = public, private, pg_temp
AS $$
  SELECT (
    (private.training_filter_local_date(
      p_activated_at,
      private.training_schedule_timezone_v1(p_timezone)
    ) + 1)::timestamp
    AT TIME ZONE private.training_schedule_timezone_v1(p_timezone)
  );
$$;

-- This is a compact, write-maintained projection rather than an event scan in
-- every candidate query.  The timestamp is the instant of the following local
-- midnight in the timezone active for the accepted decision, so DST changes or
-- a later timezone preference change cannot move an already-promised offer.
CREATE TABLE IF NOT EXISTS private.ordinary_meaning_introduction_unlocks_v1 (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  entry_id uuid NOT NULL REFERENCES public.word_entries(id) ON DELETE CASCADE,
  activated_at timestamptz NOT NULL,
  activation_timezone text NOT NULL,
  available_at timestamptz NOT NULL,
  PRIMARY KEY (user_id, entry_id)
);

CREATE INDEX IF NOT EXISTS ordinary_meaning_introduction_unlocks_available_idx
  ON private.ordinary_meaning_introduction_unlocks_v1 (user_id, available_at);

CREATE OR REPLACE FUNCTION private.record_ordinary_meaning_activation_v1(
  p_user_id uuid,
  p_entry_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE
  v_timezone text;
  v_activated_at timestamptz := now();
BEGIN
  IF p_user_id IS NULL OR p_entry_id IS NULL THEN
    RETURN;
  END IF;

  -- Source groups are the only durable multi-meaning identity.  User-owned
  -- entries are singleton groups and retain their existing new-card behavior.
  IF NOT EXISTS (
    SELECT 1
    FROM private.source_entry_bindings binding
    JOIN private.platform_v2_content_nodes node
      ON node.entry_id = binding.word_entry_id
     AND node.binding_state = 'active'
     AND node.parent_content_node_id IS NULL
     AND node.kind = 'definition'
    WHERE binding.word_entry_id = p_entry_id
      AND binding.binding_state = 'active'
  ) THEN
    RETURN;
  END IF;

  SELECT private.training_schedule_timezone_v1(settings.training_schedule_timezone)
  INTO v_timezone
  FROM public.user_settings settings
  WHERE settings.user_id = p_user_id;
  v_timezone := COALESCE(v_timezone, 'UTC');

  INSERT INTO private.ordinary_meaning_introduction_unlocks_v1 (
    user_id, entry_id, activated_at, activation_timezone, available_at
  ) VALUES (
    p_user_id,
    p_entry_id,
    v_activated_at,
    v_timezone,
    private.next_ordinary_meaning_available_at_v1(v_activated_at, v_timezone)
  )
  ON CONFLICT (user_id, entry_id) DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION private.sync_ordinary_meaning_status_activation_v1()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE
  v_is_active boolean;
BEGIN
  IF NEW.card_type_id NOT IN ('word-to-definition', 'definition-to-word') THEN
    RETURN NEW;
  END IF;

  v_is_active := COALESCE(NEW.in_learning, false)
    OR COALESCE(NEW.fsrs_enabled, false)
    OR COALESCE(NEW.fsrs_reps, 0) > 0
    OR NEW.last_reviewed_at IS NOT NULL;
  IF v_is_active THEN
    PERFORM private.record_ordinary_meaning_activation_v1(
      NEW.user_id, NEW.entry_id
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_ordinary_meaning_status_activation_v1
  ON public.user_card_status;
CREATE TRIGGER sync_ordinary_meaning_status_activation_v1
AFTER INSERT OR UPDATE OF in_learning, fsrs_enabled, fsrs_reps, last_reviewed_at
ON public.user_card_status
FOR EACH ROW EXECUTE FUNCTION private.sync_ordinary_meaning_status_activation_v1();

CREATE OR REPLACE FUNCTION private.sync_ordinary_meaning_known_activation_v1()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
BEGIN
  IF NEW.card_type_id IN ('word-to-definition', 'definition-to-word')
     AND NEW.cleared_at IS NULL THEN
    PERFORM private.record_ordinary_meaning_activation_v1(
      NEW.user_id, NEW.entry_id
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_ordinary_meaning_known_activation_v1
  ON public.user_card_known_marks;
CREATE TRIGGER sync_ordinary_meaning_known_activation_v1
AFTER INSERT OR UPDATE OF cleared_at ON public.user_card_known_marks
FOR EACH ROW EXECUTE FUNCTION private.sync_ordinary_meaning_known_activation_v1();

-- Capture the browser's resolved IANA zone at session start.  It is a
-- preference, not a caller-provided action timestamp; the action trigger uses
-- this stored value for Learn/Known from both Training and library surfaces.
CREATE OR REPLACE FUNCTION private.sync_training_schedule_timezone_v1()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE
  v_timezone text := NULLIF(trim(NEW.training_filter->>'timezone'), '');
BEGIN
  IF v_timezone IS NULL THEN
    RETURN NEW;
  END IF;

  UPDATE public.user_settings settings
  SET training_schedule_timezone = private.training_schedule_timezone_v1(v_timezone)
  WHERE settings.user_id = NEW.user_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_training_schedule_timezone_v1
  ON public.training_sessions;
CREATE TRIGGER sync_training_schedule_timezone_v1
AFTER INSERT ON public.training_sessions
FOR EACH ROW EXECUTE FUNCTION private.sync_training_schedule_timezone_v1();

-- #330 originally used numeric meaning_id as a conservative approximation for
-- "later ordinary meaning".  Source group identity now lets the content
-- projection express the real rule: idiom-only gaps do not turn the first
-- ordinary introduction into a later meaning, while a preceding ordinary
-- definition does.
CREATE OR REPLACE FUNCTION private.refresh_unrenderable_ordinary_direct_entry_v1(
  p_entry_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
BEGIN
  DELETE FROM private.unrenderable_ordinary_direct_entries_v1
  WHERE entry_id = p_entry_id;

  INSERT INTO private.unrenderable_ordinary_direct_entries_v1 (
    entry_id, updated_at
  )
  SELECT entry.id, now()
  FROM public.word_entries entry
  WHERE entry.id = p_entry_id
    AND EXISTS (
      SELECT 1
      FROM private.platform_v2_content_nodes definition
      WHERE definition.entry_id = entry.id
        AND definition.binding_state = 'active'
        AND definition.parent_content_node_id IS NULL
        AND definition.kind = 'definition'
    )
    AND NOT EXISTS (
      SELECT 1
      FROM private.platform_v2_content_nodes example
      WHERE example.entry_id = entry.id
        AND example.binding_state = 'active'
        AND example.parent_content_node_id IS NULL
        AND example.kind = 'example'
    )
    AND (
      EXISTS (
        SELECT 1
        FROM private.source_entry_bindings current_binding
        JOIN private.source_entry_bindings predecessor_binding
          ON predecessor_binding.dictionary_id = current_binding.dictionary_id
         AND predecessor_binding.identity_scheme_version = current_binding.identity_scheme_version
         AND predecessor_binding.source_group_key = current_binding.source_group_key
         AND predecessor_binding.sense_ordinal < current_binding.sense_ordinal
         AND predecessor_binding.binding_state = 'active'
        JOIN private.platform_v2_content_nodes predecessor_definition
          ON predecessor_definition.entry_id = predecessor_binding.word_entry_id
         AND predecessor_definition.binding_state = 'active'
         AND predecessor_definition.parent_content_node_id IS NULL
         AND predecessor_definition.kind = 'definition'
        WHERE current_binding.word_entry_id = entry.id
          AND current_binding.binding_state = 'active'
      )
      OR (
        NOT EXISTS (
          SELECT 1 FROM private.source_entry_bindings binding
          WHERE binding.word_entry_id = entry.id
            AND binding.binding_state = 'active'
        )
        AND COALESCE(entry.meaning_id, 1) > 1
      )
    );
END;
$$;

CREATE OR REPLACE FUNCTION private.refresh_unrenderable_ordinary_direct_group_v1(
  p_dictionary_id uuid,
  p_identity_scheme_version text,
  p_source_group_key text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE
  v_entry record;
BEGIN
  FOR v_entry IN
    SELECT binding.word_entry_id
    FROM private.source_entry_bindings binding
    WHERE binding.dictionary_id = p_dictionary_id
      AND binding.identity_scheme_version = p_identity_scheme_version
      AND binding.source_group_key = p_source_group_key
      AND binding.binding_state = 'active'
  LOOP
    PERFORM private.refresh_unrenderable_ordinary_direct_entry_v1(
      v_entry.word_entry_id
    );
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION private.sync_unrenderable_ordinary_direct_entry_v1()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE
  v_binding private.source_entry_bindings%rowtype;
  v_entry_id uuid := CASE WHEN TG_OP = 'DELETE' THEN OLD.entry_id ELSE NEW.entry_id END;
BEGIN
  SELECT * INTO v_binding
  FROM private.source_entry_bindings binding
  WHERE binding.word_entry_id = v_entry_id
    AND binding.binding_state = 'active';
  IF FOUND THEN
    PERFORM private.refresh_unrenderable_ordinary_direct_group_v1(
      v_binding.dictionary_id,
      v_binding.identity_scheme_version,
      v_binding.source_group_key
    );
  ELSE
    PERFORM private.refresh_unrenderable_ordinary_direct_entry_v1(v_entry_id);
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

CREATE OR REPLACE FUNCTION private.sync_unrenderable_ordinary_direct_binding_v1()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN
    PERFORM private.refresh_unrenderable_ordinary_direct_group_v1(
      OLD.dictionary_id, OLD.identity_scheme_version, OLD.source_group_key
    );
  END IF;
  IF TG_OP <> 'DELETE' THEN
    PERFORM private.refresh_unrenderable_ordinary_direct_group_v1(
      NEW.dictionary_id, NEW.identity_scheme_version, NEW.source_group_key
    );
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

DROP TRIGGER IF EXISTS sync_unrenderable_ordinary_direct_binding_v1
  ON private.source_entry_bindings;
CREATE TRIGGER sync_unrenderable_ordinary_direct_binding_v1
AFTER INSERT OR DELETE OR UPDATE OF dictionary_id, identity_scheme_version,
  source_group_key, sense_ordinal, word_entry_id, binding_state
ON private.source_entry_bindings
FOR EACH ROW EXECUTE FUNCTION private.sync_unrenderable_ordinary_direct_binding_v1();

DELETE FROM private.unrenderable_ordinary_direct_entries_v1;
SELECT private.refresh_unrenderable_ordinary_direct_entry_v1(entry.id)
FROM public.word_entries entry;

-- Existing learner state is never re-gated.  There is no reliable historic
-- timezone for it, so its already-accepted predecessor becomes offerable now.
INSERT INTO private.ordinary_meaning_introduction_unlocks_v1 (
  user_id, entry_id, activated_at, activation_timezone, available_at
)
SELECT DISTINCT enrolled.user_id, enrolled.entry_id, now(), 'UTC', now()
FROM (
  SELECT status.user_id, status.entry_id
  FROM public.user_card_status status
  WHERE status.card_type_id IN ('word-to-definition', 'definition-to-word')
    AND (
      COALESCE(status.in_learning, false)
      OR COALESCE(status.fsrs_enabled, false)
      OR COALESCE(status.fsrs_reps, 0) > 0
      OR status.last_reviewed_at IS NOT NULL
    )
  UNION
  SELECT known.user_id, known.entry_id
  FROM public.user_card_known_marks known
  WHERE known.card_type_id IN ('word-to-definition', 'definition-to-word')
    AND known.cleared_at IS NULL
) enrolled
WHERE EXISTS (
  SELECT 1
  FROM private.source_entry_bindings binding
  JOIN private.platform_v2_content_nodes definition
    ON definition.entry_id = binding.word_entry_id
   AND definition.binding_state = 'active'
   AND definition.parent_content_node_id IS NULL
   AND definition.kind = 'definition'
  WHERE binding.word_entry_id = enrolled.entry_id
    AND binding.binding_state = 'active'
)
ON CONFLICT (user_id, entry_id) DO NOTHING;

CREATE OR REPLACE FUNCTION private.training_scheduler_candidates_v2(
  p_user_id uuid,
  p_card_type_ids text[],
  p_list_id uuid,
  p_list_type text,
  p_card_filter text,
  p_queue_turn text,
  p_exclude_entry_ids uuid[],
  p_exclude_card_keys text[],
  p_training_filter jsonb,
  p_filtered boolean,
  p_enforce_daily_limits boolean
)
RETURNS TABLE(
  entry_id uuid,
  card_type_id text,
  queue_source text,
  selection_order bigint,
  new_today bigint,
  daily_new_limit bigint,
  new_pool_size bigint,
  learning_due_count bigint,
  review_pool_size bigint
)
LANGUAGE sql VOLATILE SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
WITH args AS (
  SELECT CASE
      WHEN p_card_type_ids IS NULL OR cardinality(p_card_type_ids)=0
        THEN ARRAY['word-to-definition']::text[]
      ELSE ARRAY(
        SELECT DISTINCT trim(mode)
        FROM unnest(p_card_type_ids) requested(mode)
        WHERE trim(mode)<>'' ORDER BY 1
      )
    END modes,
    COALESCE(p_training_filter,'{}') filter_data,
    COALESCE(p_list_type,'curated') list_type,
    COALESCE(p_exclude_entry_ids,ARRAY[]::uuid[]) excluded_entries,
    COALESCE(p_exclude_card_keys,ARRAY[]::text[]) excluded_cards
), filter_values AS (
  SELECT args.*,
    private.training_filter_target_date(filter_data) target_date,
    COALESCE(NULLIF(trim(filter_data->>'timezone'),''),'UTC') timezone,
    CASE WHEN NULLIF(filter_data->>'sourceId','') ~
      '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
      THEN (filter_data->>'sourceId')::uuid END source_id,
    NULLIF(trim(filter_data->>'sourceKind'),'') source_kind,
    NULLIF(trim(filter_data->>'externalId'),'') external_id
  FROM args
), mode_order AS (
  SELECT requested_mode.card_type_id,random() mode_random
  FROM filter_values
  CROSS JOIN unnest(filter_values.modes) requested_mode(card_type_id)
), cohort_context AS (
  SELECT md5(concat_ws('|',
    p_user_id::text,
    array_to_string(filter_values.modes,','),
    COALESCE(p_list_id::text,''),
    filter_values.list_type,
    p_card_filter,
    filter_values.filter_data::text
  )) cohort_seed
  FROM filter_values
), limits AS (
  SELECT COALESCE(settings.daily_new_limit,10)::bigint new_limit,
    COALESCE(settings.daily_review_limit,200)::bigint review_limit
  FROM (SELECT 1) seed
  LEFT JOIN user_settings settings ON settings.user_id=p_user_id
), daily AS (
  SELECT count(DISTINCT log.word_id) FILTER (WHERE log.review_type='new') new_today,
    count(*) FILTER (WHERE log.review_type='review') review_today
  FROM user_review_log log, filter_values
  WHERE log.user_id=p_user_id
    AND log.mode=ANY(filter_values.modes)
    AND log.reviewed_at::date=current_date
), readable_dictionaries AS MATERIALIZED (
  SELECT dictionary.id
  FROM dictionaries dictionary
  WHERE can_access_dictionary(p_user_id,dictionary.id,'read')
), scope AS MATERIALIZED (
  SELECT scope_entry.entry_id AS id
  FROM private.default_training_scope_entries_v1 scope_entry
  CROSS JOIN filter_values
  LEFT JOIN readable_dictionaries readable_dictionary
    ON readable_dictionary.id=scope_entry.dictionary_id
  WHERE p_list_id IS NULL
    AND NOT (scope_entry.entry_id=ANY(filter_values.excluded_entries))
    AND (scope_entry.dictionary_id IS NULL OR readable_dictionary.id IS NOT NULL)
  UNION ALL
  SELECT entry.id
  FROM word_entries entry
  CROSS JOIN filter_values
  LEFT JOIN readable_dictionaries readable_dictionary
    ON readable_dictionary.id=entry.dictionary_id
  WHERE p_list_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM word_entries pointer_entry
      WHERE pointer_entry.id=entry.id
        AND private.is_pointer_only_dictionary_entry_v1(pointer_entry.raw)
    )
    AND NOT (entry.id=ANY(filter_values.excluded_entries))
    AND (entry.dictionary_id IS NULL OR readable_dictionary.id IS NOT NULL)
    AND ((filter_values.list_type='curated' AND EXISTS (
        SELECT 1 FROM word_list_items item
        WHERE item.list_id=p_list_id AND item.word_id=entry.id
      ))
      OR (filter_values.list_type='user' AND EXISTS (
        SELECT 1 FROM user_word_list_items item
        JOIN user_word_lists list ON list.id=item.list_id
        WHERE item.list_id=p_list_id AND item.word_id=entry.id AND list.user_id=p_user_id
      )))
), matched AS (
  SELECT event.entry_id,event.card_type_id,max(event.created_at) latest_event_at
  FROM user_card_action_events event
  LEFT JOIN learning_sources source ON source.id=event.source_id
  CROSS JOIN filter_values
  WHERE event.user_id=p_user_id
    AND event.card_type_id=ANY(filter_values.modes)
    AND (filter_values.target_date IS NULL OR
      private.training_filter_local_date(event.created_at,filter_values.timezone)=filter_values.target_date)
    AND (filter_values.source_id IS NULL OR event.source_id=filter_values.source_id)
    AND (filter_values.source_kind IS NULL OR source.kind=filter_values.source_kind
      OR source.provider=filter_values.source_kind
      OR (filter_values.source_kind='youtube' AND
        (source.kind IN ('youtube','youtube_video') OR source.provider='youtube')))
    AND (filter_values.external_id IS NULL OR source.external_id=filter_values.external_id)
  GROUP BY event.entry_id,event.card_type_id
), today_new_words AS MATERIALIZED (
  SELECT DISTINCT log.word_id
  FROM user_review_log log, filter_values
  WHERE log.user_id=p_user_id
    AND log.mode=ANY(filter_values.modes)
    AND log.review_type='new'
    AND log.reviewed_at::date=current_date
), today_new_cards AS MATERIALIZED (
  SELECT DISTINCT log.word_id,log.mode AS card_type_id
  FROM user_review_log log, filter_values
  WHERE log.user_id=p_user_id
    AND log.mode=ANY(filter_values.modes)
    AND log.review_type='new'
    AND log.reviewed_at::date=current_date
), known_cards AS MATERIALIZED (
  SELECT known.entry_id,known.card_type_id
  FROM user_card_known_marks known,filter_values
  WHERE known.user_id=p_user_id
    AND known.card_type_id=ANY(filter_values.modes)
    AND known.cleared_at IS NULL
), learner_status AS MATERIALIZED (
  SELECT status.*
  FROM user_card_status status,filter_values
  WHERE status.user_id=p_user_id
    AND status.card_type_id=ANY(filter_values.modes)
), unrenderable_direct_entries AS MATERIALIZED (
  SELECT entry_id FROM private.unrenderable_ordinary_direct_entries_v1
), source_bound_entries AS MATERIALIZED (
  SELECT binding.word_entry_id AS entry_id
  FROM private.source_entry_bindings binding
  WHERE binding.binding_state = 'active'
), ordinary_source_introductions AS MATERIALIZED (
  SELECT binding.word_entry_id AS entry_id,
    lag(binding.word_entry_id) OVER (
      PARTITION BY binding.dictionary_id, binding.identity_scheme_version,
        binding.source_group_key
      ORDER BY binding.sense_ordinal, binding.word_entry_id
    ) AS predecessor_entry_id
  FROM private.source_entry_bindings binding
  JOIN private.platform_v2_content_nodes definition
    ON definition.entry_id = binding.word_entry_id
   AND definition.binding_state = 'active'
   AND definition.parent_content_node_id IS NULL
   AND definition.kind = 'definition'
  LEFT JOIN unrenderable_direct_entries unrenderable
    ON unrenderable.entry_id = binding.word_entry_id
  WHERE binding.binding_state = 'active'
    AND unrenderable.entry_id IS NULL
), cards AS (
  SELECT scope.id entry_id,mode_order.card_type_id,status.fsrs_enabled,
    status.fsrs_last_interval,status.next_review_at,status.hidden,status.frozen_until,
    status.entry_id IS NOT NULL has_status,matched.entry_id IS NOT NULL matches_filter,
    matched.latest_event_at,mode_order.mode_random,
    today_new_words.word_id IS NOT NULL new_seen_today,
    today_new_cards.word_id IS NOT NULL new_card_seen_today,
    CASE
      WHEN status.fsrs_enabled=true AND COALESCE(status.fsrs_last_interval,0)<1
        AND status.next_review_at<=now() THEN 'learning'
      WHEN status.fsrs_enabled=true AND status.fsrs_last_interval>=1
        AND status.next_review_at<=now() THEN 'review'
      WHEN status.entry_id IS NULL OR COALESCE(status.fsrs_enabled,false)=false THEN 'new'
      ELSE 'practice'
    END intrinsic_source
  FROM scope
  CROSS JOIN filter_values CROSS JOIN mode_order
  LEFT JOIN learner_status status ON status.entry_id=scope.id
    AND status.card_type_id=mode_order.card_type_id
  LEFT JOIN matched ON matched.entry_id=scope.id AND matched.card_type_id=mode_order.card_type_id
  LEFT JOIN today_new_words ON today_new_words.word_id=scope.id
  LEFT JOIN today_new_cards ON today_new_cards.word_id=scope.id
    AND today_new_cards.card_type_id=mode_order.card_type_id
  LEFT JOIN known_cards ON known_cards.entry_id=scope.id
    AND known_cards.card_type_id=mode_order.card_type_id
  WHERE NOT ((scope.id::text||':'||mode_order.card_type_id)=ANY(filter_values.excluded_cards))
    AND known_cards.entry_id IS NULL
), eligible AS (
  SELECT cards.*
  FROM cards
  LEFT JOIN unrenderable_direct_entries unrenderable
    ON unrenderable.entry_id = cards.entry_id
  LEFT JOIN source_bound_entries source_bound
    ON source_bound.entry_id = cards.entry_id
  LEFT JOIN ordinary_source_introductions introduction
    ON introduction.entry_id = cards.entry_id
  LEFT JOIN private.ordinary_meaning_introduction_unlocks_v1 predecessor_unlock
    ON predecessor_unlock.user_id = p_user_id
   AND predecessor_unlock.entry_id = introduction.predecessor_entry_id
  WHERE COALESCE(hidden,false)=false AND (frozen_until IS NULL OR frozen_until<=now())
    AND (
      card_type_id <> 'word-to-definition'
      OR unrenderable.entry_id IS NULL
    )
    AND (
      intrinsic_source <> 'new'
      OR (
        card_type_id = 'word-to-definition'
        AND (
          source_bound.entry_id IS NULL
          OR (
            introduction.entry_id IS NOT NULL
            AND (
              introduction.predecessor_entry_id IS NULL
              OR predecessor_unlock.available_at <= now()
            )
          )
        )
      )
    )
    AND CASE WHEN p_filtered THEN
      matches_filter AND has_status AND
      (p_card_filter='both' OR (p_card_filter='review' AND fsrs_enabled=true)
        OR (p_card_filter='new' AND COALESCE(fsrs_enabled,false)=false))
    ELSE NOT has_status OR fsrs_enabled=true END
), new_word_ranks AS (
  SELECT unseen.entry_id,
    row_number() OVER (
      ORDER BY md5(cohort_context.cohort_seed||':'||unseen.entry_id::text)
    ) new_word_ordinal,
    count(*) OVER () new_word_count
  FROM (
    SELECT DISTINCT entry_id FROM eligible
    WHERE intrinsic_source='new' AND NOT new_seen_today
  ) unseen CROSS JOIN cohort_context
), ranked AS (
  SELECT eligible.*,
    row_number() OVER (
      PARTITION BY eligible.intrinsic_source
      ORDER BY CASE WHEN eligible.intrinsic_source IN ('review','learning') THEN eligible.next_review_at END,
        md5(eligible.entry_id::text||':'||eligible.card_type_id)
    ) source_ordinal,
    new_word_ranks.new_word_ordinal,
    COALESCE((SELECT max(new_word_count) FROM new_word_ranks),0) new_word_count,
    count(*) FILTER (WHERE intrinsic_source='review') OVER () review_count
  FROM eligible
  LEFT JOIN new_word_ranks ON new_word_ranks.entry_id=eligible.entry_id
), classified AS (
  SELECT ranked.*,
    GREATEST(0,limits.new_limit-COALESCE(daily.new_today,0)) new_remaining,
    GREATEST(0,limits.review_limit-COALESCE(daily.review_today,0)) review_remaining
  FROM ranked CROSS JOIN limits CROSS JOIN daily
), scheduled AS (
  SELECT classified.*,
    CASE
      WHEN p_filtered AND (
        p_card_filter = 'both'
        OR (p_card_filter = 'new' AND intrinsic_source = 'new')
        OR (p_card_filter = 'review' AND intrinsic_source IN ('learning', 'review'))
      ) THEN intrinsic_source
      WHEN p_filtered THEN NULL
      WHEN intrinsic_source='learning' AND p_card_filter='both' THEN 'learning'
      WHEN intrinsic_source='review' AND p_card_filter<>'new'
        AND (NOT p_enforce_daily_limits OR source_ordinal<=review_remaining) THEN 'review'
      WHEN intrinsic_source='new' AND p_card_filter<>'review'
        AND (NOT p_enforce_daily_limits OR (new_seen_today AND NOT new_card_seen_today)
          OR new_word_ordinal<=new_remaining) THEN 'new'
      WHEN p_card_filter<>'both' OR NOT (
        p_enforce_daily_limits
        AND COALESCE(daily.new_today,0)+LEAST(new_word_count,new_remaining)>=limits.new_limit
        AND COALESCE(daily.review_today,0)+LEAST(review_count,review_remaining)>=limits.review_limit
      ) THEN 'practice'
      ELSE NULL
    END queue_source
  FROM classified CROSS JOIN limits CROSS JOIN daily
), diagnostics AS (
  SELECT
    CASE WHEN p_filtered THEN
      count(*) FILTER (
        WHERE matches_filter AND has_status AND COALESCE(hidden,false)=false
          AND (frozen_until IS NULL OR frozen_until<=now())
          AND COALESCE(fsrs_enabled,false)=false
      )
    ELSE (
      SELECT count(*)
      FROM scope
      LEFT JOIN (SELECT DISTINCT entry_id FROM learner_status) pool_status
        ON pool_status.entry_id=scope.id
      WHERE pool_status.entry_id IS NULL
    ) END AS new_pool_size,
    count(*) FILTER (
      WHERE (NOT p_filtered OR matches_filter) AND has_status
        AND COALESCE(hidden,false)=false
        AND (frozen_until IS NULL OR frozen_until<=now())
        AND COALESCE(fsrs_enabled,false)=true
        AND COALESCE(fsrs_last_interval,0)<1 AND next_review_at<=now()
    ) AS learning_due_count,
    count(*) FILTER (
      WHERE (NOT p_filtered OR matches_filter) AND has_status
        AND COALESCE(hidden,false)=false
        AND (frozen_until IS NULL OR frozen_until<=now())
        AND COALESCE(fsrs_enabled,false)=true
        AND fsrs_last_interval>=1 AND next_review_at<=now()
    ) AS review_pool_size
  FROM cards
), ordered AS (
  SELECT scheduled.*,
    CASE
      WHEN p_filtered AND p_queue_turn='review' AND queue_source IN ('review','learning') THEN 0
      WHEN p_filtered AND p_queue_turn='new' AND queue_source='new' THEN 0
      WHEN NOT p_filtered AND p_queue_turn='new' AND queue_source='new' THEN 0
      WHEN NOT p_filtered AND p_queue_turn='new' AND queue_source='learning' THEN 1
      WHEN NOT p_filtered AND p_queue_turn='new' AND queue_source='review' THEN 2
      WHEN queue_source='review' THEN 1
      WHEN queue_source='learning' THEN 2
      WHEN queue_source='new' THEN 3
      ELSE 4
    END source_rank
  FROM scheduled WHERE queue_source IS NOT NULL
)
SELECT entry_id,card_type_id,queue_source,
  row_number() OVER (ORDER BY source_rank,
    CASE WHEN p_filtered THEN latest_event_at END DESC NULLS LAST,
    CASE WHEN queue_source IN ('review','learning') THEN next_review_at END,
    CASE WHEN queue_source IN ('new','practice') THEN mode_random END,
    CASE WHEN queue_source IN ('new','practice') THEN random() END) selection_order,
  COALESCE(daily.new_today,0),limits.new_limit,COALESCE(diagnostics.new_pool_size,0),
  COALESCE(diagnostics.learning_due_count,0),LEAST(COALESCE(diagnostics.review_pool_size,0),10)
FROM ordered CROSS JOIN daily CROSS JOIN limits CROSS JOIN diagnostics;
$$;

ALTER FUNCTION private.training_scheduler_candidates_v2(
  uuid,text[],uuid,text,text,text,uuid[],text[],jsonb,boolean,boolean
) OWNER TO postgres;
REVOKE ALL ON FUNCTION private.training_scheduler_candidates_v2(
  uuid,text[],uuid,text,text,text,uuid[],text[],jsonb,boolean,boolean
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
VOLATILE
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

  -- The plan and selector must share one eligibility relation.  The prior
  -- count-only fast path predates sequential introductions and could promise
  -- reverse/new or later-sense cards that a finite session cannot latch.
  SELECT count(*) FILTER (WHERE queue_source = 'new'),
    count(*) FILTER (WHERE queue_source IN ('learning', 'review')),
    count(*) FILTER (WHERE queue_source = 'practice')
  INTO planned_new, planned_review, planned_practice
  FROM private.training_scheduler_candidates_v2(
    p_user_id, p_card_type_ids, p_list_id, p_list_type,
    p_card_filter, 'auto', ARRAY[]::uuid[], ARRAY[]::text[], filter_data,
    filtered, true
  );

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

ALTER FUNCTION public.get_training_session_plan(
  uuid,text[],uuid,text,text,jsonb
) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_training_session_plan(
  uuid,text[],uuid,text,text,jsonb
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_training_session_plan(
  uuid,text[],uuid,text,text,jsonb
) TO authenticated;

REVOKE ALL ON TABLE private.ordinary_meaning_introduction_unlocks_v1
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.training_schedule_timezone_v1(text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.next_ordinary_meaning_available_at_v1(timestamptz,text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.record_ordinary_meaning_activation_v1(uuid,uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.sync_ordinary_meaning_status_activation_v1()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.sync_ordinary_meaning_known_activation_v1()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.sync_training_schedule_timezone_v1()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.refresh_unrenderable_ordinary_direct_group_v1(uuid,text,text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.sync_unrenderable_ordinary_direct_binding_v1()
  FROM PUBLIC, anon, authenticated, service_role;

COMMIT;
