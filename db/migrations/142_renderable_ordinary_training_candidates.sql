-- Keep ordinary direct recall out of the queue when a later meaning has no
-- owned context. The rule is content-derived and reversible: reconciliation
-- reactivates the candidate as soon as an owned root example is available.
-- Idiom-only meanings deliberately retain the legacy ordinary-mode path until
-- #332 performs its separately approved family transition.

BEGIN;

-- Candidate selection consults this durable projection for every ordinary
-- direction in scope. Keep the root-node existence checks index-backed rather
-- than making the scheduler parse or scan content for each candidate.
CREATE INDEX IF NOT EXISTS
  platform_v2_content_nodes_active_root_kind_entry_idx
ON private.platform_v2_content_nodes (entry_id, kind)
WHERE binding_state = 'active'
  AND parent_content_node_id IS NULL;

-- Store only the exceptional state the scheduler needs. The usual case does
-- not occupy a row, so a wide training scope avoids an extra lookup per card.
CREATE TABLE IF NOT EXISTS private.unrenderable_ordinary_direct_entries_v1 (
  entry_id uuid PRIMARY KEY REFERENCES public.word_entries(id) ON DELETE CASCADE,
  updated_at timestamptz NOT NULL DEFAULT now()
);

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
  SELECT
    node.entry_id,
    now()
  FROM private.platform_v2_content_nodes node
  JOIN public.word_entries entry ON entry.id = node.entry_id
  WHERE node.entry_id = p_entry_id
    AND COALESCE(entry.meaning_id, 1) > 1
    AND node.binding_state = 'active'
    AND node.parent_content_node_id IS NULL
    AND node.kind IN ('definition', 'example')
  GROUP BY node.entry_id
  HAVING bool_or(node.kind = 'definition')
    AND NOT bool_or(node.kind = 'example');
END;
$$;

CREATE OR REPLACE FUNCTION private.sync_unrenderable_ordinary_direct_entry_v1()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM private.refresh_unrenderable_ordinary_direct_entry_v1(OLD.entry_id);
    RETURN OLD;
  END IF;

  PERFORM private.refresh_unrenderable_ordinary_direct_entry_v1(NEW.entry_id);
  IF TG_OP = 'UPDATE' AND OLD.entry_id IS DISTINCT FROM NEW.entry_id THEN
    PERFORM private.refresh_unrenderable_ordinary_direct_entry_v1(OLD.entry_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_unrenderable_ordinary_direct_entry_v1
  ON private.platform_v2_content_nodes;
CREATE TRIGGER sync_unrenderable_ordinary_direct_entry_v1
AFTER INSERT OR DELETE OR UPDATE OF entry_id, kind, parent_content_node_id, binding_state
ON private.platform_v2_content_nodes
FOR EACH ROW EXECUTE FUNCTION private.sync_unrenderable_ordinary_direct_entry_v1();

INSERT INTO private.unrenderable_ordinary_direct_entries_v1 (
  entry_id, updated_at
)
SELECT
  node.entry_id,
  now()
FROM private.platform_v2_content_nodes node
JOIN public.word_entries entry ON entry.id = node.entry_id
WHERE node.binding_state = 'active'
  AND COALESCE(entry.meaning_id, 1) > 1
  AND node.parent_content_node_id IS NULL
  AND node.kind IN ('definition', 'example')
GROUP BY node.entry_id
HAVING bool_or(node.kind = 'definition')
  AND NOT bool_or(node.kind = 'example')
ON CONFLICT (entry_id) DO UPDATE SET
  updated_at = EXCLUDED.updated_at;

ALTER FUNCTION private.refresh_unrenderable_ordinary_direct_entry_v1(uuid) OWNER TO postgres;
ALTER FUNCTION private.sync_unrenderable_ordinary_direct_entry_v1() OWNER TO postgres;
REVOKE ALL ON FUNCTION private.refresh_unrenderable_ordinary_direct_entry_v1(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.sync_unrenderable_ordinary_direct_entry_v1()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION private.training_ordinary_direct_recall_renderable_v1(
  p_entry_id uuid,
  p_meaning_id integer,
  p_card_type_id text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
  SELECT CASE
    WHEN p_card_type_id <> 'word-to-definition' THEN true
    WHEN COALESCE(p_meaning_id, 1) <= 1 THEN true
    -- Idiom-only meanings have no row here and retain their legacy ordinary
    -- path until #332 moves them to their independent exercise family.
    WHEN EXISTS (
      SELECT 1
      FROM private.unrenderable_ordinary_direct_entries_v1 unrenderable
      WHERE unrenderable.entry_id = p_entry_id
    ) THEN false
    ELSE true
  END;
$$;

ALTER FUNCTION private.training_ordinary_direct_recall_renderable_v1(
  uuid, integer, text
) OWNER TO postgres;
REVOKE ALL ON FUNCTION private.training_ordinary_direct_recall_renderable_v1(
  uuid, integer, text
) FROM PUBLIC, anon, authenticated, service_role;

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
  WHERE COALESCE(hidden,false)=false AND (frozen_until IS NULL OR frozen_until<=now())
    AND (
      card_type_id <> 'word-to-definition'
      OR unrenderable.entry_id IS NULL
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
    ) END new_pool_size,
    count(*) FILTER (
      WHERE (NOT p_filtered OR matches_filter) AND has_status
        AND COALESCE(hidden,false)=false AND (frozen_until IS NULL OR frozen_until<=now())
        AND fsrs_enabled=true AND COALESCE(fsrs_last_interval,0)<1 AND next_review_at<=now()
    ) learning_due_count,
    count(*) FILTER (
      WHERE (NOT p_filtered OR matches_filter) AND has_status
        AND COALESCE(hidden,false)=false AND (frozen_until IS NULL OR frozen_until<=now())
        AND fsrs_enabled=true AND fsrs_last_interval>=1 AND next_review_at<=now()
    ) review_pool_size
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
  COALESCE(daily.new_today,0),limits.new_limit,diagnostics.new_pool_size,
  diagnostics.learning_due_count,LEAST(diagnostics.review_pool_size,10)
FROM ordered CROSS JOIN daily CROSS JOIN limits CROSS JOIN diagnostics;
$$;

ALTER FUNCTION private.training_scheduler_candidates_v2(
  uuid,text[],uuid,text,text,text,uuid[],text[],jsonb,boolean,boolean
) OWNER TO postgres;
REVOKE ALL ON FUNCTION private.training_scheduler_candidates_v2(
  uuid,text[],uuid,text,text,text,uuid[],text[],jsonb,boolean,boolean
) FROM PUBLIC, anon, authenticated, service_role;

-- Sessions created before this migration may still contain a now-ineligible
-- direct member. Keep their immutable membership intact, but let the existing
-- replacement path retire that one presentation safely and without a grade.
DO $rename_unavailable_base$
BEGIN
  -- Normal forward rollout renames migration 136's evidence checker once.
  -- The guard also lets contract/drift tests replay this migration safely.
  IF to_regprocedure(
       'private.mark_training_session_member_unavailable_base_v1(uuid,uuid,uuid,text,text)'
     ) IS NULL THEN
    EXECUTE
      'ALTER FUNCTION private.mark_training_session_member_unavailable(uuid,uuid,uuid,text,text) ' ||
      'RENAME TO mark_training_session_member_unavailable_base_v1';
  END IF;
END
$rename_unavailable_base$;

CREATE OR REPLACE FUNCTION private.mark_training_session_member_unavailable(
  p_user_id uuid,
  p_session_id uuid,
  p_entry_id uuid,
  p_card_type_id text,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE
  v_session public.training_sessions%rowtype;
  v_member public.training_session_members%rowtype;
  v_expected_member public.training_session_members%rowtype;
  v_entry public.word_entries%rowtype;
  v_remaining integer;
BEGIN
  IF p_reason <> 'direct-example-missing' THEN
    RETURN private.mark_training_session_member_unavailable_base_v1(
      p_user_id, p_session_id, p_entry_id, p_card_type_id, p_reason
    );
  END IF;

  IF (select auth.uid()) IS NULL OR p_user_id IS DISTINCT FROM (select auth.uid()) THEN
    RAISE EXCEPTION 'unauthorized: user_id does not match authenticated user';
  END IF;

  SELECT * INTO v_session
  FROM public.training_sessions session
  WHERE session.id = p_session_id AND session.user_id = p_user_id
  FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('status', 'not-member'); END IF;

  SELECT member.* INTO v_member
  FROM public.training_session_members member
  WHERE member.session_id = p_session_id
    AND member.entry_id = p_entry_id
    AND member.card_type_id = p_card_type_id
  FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('status', 'not-member'); END IF;
  IF v_member.consumed_at IS NOT NULL THEN
    RETURN jsonb_build_object('status', 'consumed', 'ordinal', v_member.ordinal);
  END IF;
  IF v_member.unavailable_at IS NOT NULL THEN
    RETURN jsonb_build_object(
      'status', 'unavailable', 'ordinal', v_member.ordinal,
      'reason', v_member.unavailable_reason
    );
  END IF;

  SELECT entry.* INTO v_entry
  FROM public.word_entries entry
  WHERE entry.id = v_member.entry_id;
  IF NOT FOUND
     OR private.training_ordinary_direct_recall_renderable_v1(
       v_entry.id, v_entry.meaning_id, v_member.card_type_id
     ) THEN
    RAISE EXCEPTION
      'training session unavailable evidence mismatch: requested %, observed %',
      p_reason,
      CASE WHEN NOT FOUND THEN 'entry-not-found' ELSE 'member-renderable' END;
  END IF;

  SELECT member.* INTO v_expected_member
  FROM public.training_session_members member
  WHERE member.session_id = p_session_id
    AND member.consumed_at IS NULL
    AND member.unavailable_at IS NULL
  ORDER BY member.ordinal
  LIMIT 1;
  IF NOT FOUND
     OR v_expected_member.entry_id IS DISTINCT FROM v_member.entry_id
     OR v_expected_member.card_type_id IS DISTINCT FROM v_member.card_type_id THEN
    RETURN jsonb_build_object(
      'status', 'out-of-order', 'ordinal', v_member.ordinal,
      'expectedOrdinal', v_expected_member.ordinal
    );
  END IF;

  UPDATE public.training_session_members
  SET unavailable_at = now(), unavailable_reason = p_reason
  WHERE session_id = v_member.session_id AND ordinal = v_member.ordinal;

  SELECT count(*)::integer INTO v_remaining
  FROM public.training_session_members member
  WHERE member.session_id = v_member.session_id
    AND member.consumed_at IS NULL
    AND member.unavailable_at IS NULL;
  IF v_remaining = 0 THEN
    UPDATE public.training_sessions
    SET completed_at = COALESCE(completed_at, now())
    WHERE id = v_member.session_id;
  END IF;

  RETURN jsonb_build_object(
    'status', CASE WHEN v_remaining = 0 THEN 'unavailable-complete' ELSE 'unavailable' END,
    'ordinal', v_member.ordinal,
    'reason', p_reason,
    'remaining', v_remaining
  );
END;
$$;

ALTER FUNCTION private.mark_training_session_member_unavailable(
  uuid, uuid, uuid, text, text
) OWNER TO postgres;
REVOKE ALL ON FUNCTION private.mark_training_session_member_unavailable(
  uuid, uuid, uuid, text, text
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.mark_training_session_member_unavailable_base_v1(
  uuid, uuid, uuid, text, text
) FROM PUBLIC, anon, authenticated, service_role;

COMMIT;
