-- Accepted non-session actions invalidate only the active ordinary remainder.
-- Consumed membership, action receipts, exact meaning/direction and FSRS remain unchanged.
BEGIN;
ALTER TABLE public.training_sessions
  ADD COLUMN IF NOT EXISTS external_state_revision bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS planned_state_revision bigint NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS private.training_session_replan_history (
  session_id uuid NOT NULL REFERENCES public.training_sessions(id) ON DELETE CASCADE,
  revision bigint NOT NULL,
  prior_members jsonb NOT NULL,
  replanned_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(session_id, revision)
);
ALTER TABLE private.training_session_replan_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.training_session_replan_history FROM PUBLIC,anon,authenticated,service_role;

-- Unconsumed members are a replaceable plan, not accepted review history.
-- API roles have no table mutation grants. Preserve consumed identity forever.
CREATE OR REPLACE FUNCTION private.prevent_training_membership_identity_update_v1()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.consumed_at IS NOT NULL THEN RAISE EXCEPTION 'training_session_membership_immutable'; END IF;
    RETURN OLD;
  END IF;
  IF OLD.session_id IS DISTINCT FROM NEW.session_id
     OR OLD.ordinal IS DISTINCT FROM NEW.ordinal
     OR OLD.entry_id IS DISTINCT FROM NEW.entry_id
     OR OLD.card_type_id IS DISTINCT FROM NEW.card_type_id
     OR OLD.queue_source IS DISTINCT FROM NEW.queue_source THEN
    RAISE EXCEPTION 'training_session_membership_immutable';
  END IF;
  RETURN NEW;
END;
$$;

-- Extend the existing canonical mixture planner with exact-key exclusions.
-- The compatibility overload delegates; there is one mixture implementation.
CREATE OR REPLACE FUNCTION private.training_session_members_v1(
  p_user_id uuid,
  p_card_type_ids text[],
  p_list_id uuid,
  p_list_type text,
  p_card_filter text,
  p_training_filter jsonb,
  p_session_size text,
  p_new_review_ratio integer,
  p_exclude_card_keys text[]
)
RETURNS TABLE(
  entry_id uuid,
  card_type_id text,
  queue_source text,
  session_ordinal integer
)
LANGUAGE sql VOLATILE SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
WITH RECURSIVE requested AS (
  SELECT CASE WHEN p_session_size = 'all-due-today' THEN NULL
              ELSE p_session_size::integer END AS requested_total
), candidates AS MATERIALIZED (
  SELECT candidate.entry_id,
    candidate.card_type_id,
    candidate.queue_source,
    candidate.selection_order,
    CASE WHEN candidate.queue_source = 'new' THEN 'new' ELSE 'review' END AS category
  FROM private.training_scheduler_candidates_v2(
    p_user_id, p_card_type_ids, p_list_id, COALESCE(p_list_type, 'curated'),
    p_card_filter, 'auto', ARRAY[]::uuid[], COALESCE(p_exclude_card_keys,ARRAY[]::text[]),
    COALESCE(p_training_filter, '{}'::jsonb),
    private.training_filter_target_date(COALESCE(p_training_filter, '{}'::jsonb)) IS NOT NULL
      OR NULLIF(COALESCE(p_training_filter, '{}'::jsonb)->>'sourceId', '') IS NOT NULL
      OR NULLIF(trim(COALESCE(p_training_filter, '{}'::jsonb)->>'sourceKind'), '') IS NOT NULL
      OR NULLIF(trim(COALESCE(p_training_filter, '{}'::jsonb)->>'externalId'), '') IS NOT NULL,
    false
  ) candidate
  WHERE candidate.queue_source IN ('new', 'learning', 'review')
), ranked AS MATERIALIZED (
  SELECT candidates.*,
    row_number() OVER (
      PARTITION BY category ORDER BY selection_order
    )::integer AS category_rank
  FROM candidates
), policy AS MATERIALIZED (
  SELECT
    count(*) FILTER (WHERE category = 'new')::integer AS available_new,
    count(*) FILTER (WHERE category = 'review')::integer AS available_review,
    p_new_review_ratio AS ratio,
    COALESCE(
      requested.requested_total,
      count(*) FILTER (WHERE category IN ('new', 'review'))::integer
    ) AS target_total
  FROM ranked
  CROSS JOIN requested
  GROUP BY requested.requested_total
), sequence(
  session_ordinal, phase, new_taken, review_taken, category, category_rank
) AS (
  SELECT
    1,
    1,
    CASE WHEN choice.category = 'new' THEN 1 ELSE 0 END,
    CASE WHEN choice.category = 'review' THEN 1 ELSE 0 END,
    choice.category,
    1
  FROM policy
  CROSS JOIN LATERAL (
    SELECT CASE
      WHEN policy.available_new > 0 THEN 'new'
      WHEN policy.available_review > 0 THEN 'review'
    END AS category
  ) choice
  WHERE policy.target_total > 0
    AND choice.category IS NOT NULL

  UNION ALL

  SELECT
    sequence.session_ordinal + 1,
    CASE
      WHEN choice.category = 'new' THEN 1
      WHEN sequence.phase >= policy.ratio THEN 0
      ELSE sequence.phase + 1
    END,
    sequence.new_taken + CASE WHEN choice.category = 'new' THEN 1 ELSE 0 END,
    sequence.review_taken + CASE WHEN choice.category = 'review' THEN 1 ELSE 0 END,
    choice.category,
    CASE WHEN choice.category = 'new'
      THEN sequence.new_taken + 1
      ELSE sequence.review_taken + 1
    END
  FROM sequence
  CROSS JOIN policy
  CROSS JOIN LATERAL (
    SELECT CASE
      WHEN sequence.phase = 0 AND sequence.new_taken < policy.available_new THEN 'new'
      WHEN sequence.phase = 0 AND sequence.review_taken < policy.available_review THEN 'review'
      WHEN sequence.phase > 0 AND sequence.review_taken < policy.available_review THEN 'review'
      WHEN sequence.phase > 0 AND sequence.new_taken < policy.available_new THEN 'new'
    END AS category
  ) choice
  WHERE sequence.session_ordinal < policy.target_total
    AND choice.category IS NOT NULL
)
SELECT ranked.entry_id,
  ranked.card_type_id,
  ranked.queue_source,
  sequence.session_ordinal
FROM sequence
JOIN ranked
  ON ranked.category = sequence.category
 AND ranked.category_rank = sequence.category_rank
ORDER BY sequence.session_ordinal;
$$;
ALTER FUNCTION private.training_session_members_v1(
  uuid,text[],uuid,text,text,jsonb,text,integer,text[]
) OWNER TO postgres;
REVOKE ALL ON FUNCTION private.training_session_members_v1(
  uuid,text[],uuid,text,text,jsonb,text,integer,text[]
) FROM PUBLIC, anon, authenticated, service_role;


CREATE OR REPLACE FUNCTION private.training_session_members_v1(
  p_user_id uuid,p_card_type_ids text[],p_list_id uuid,p_list_type text,
  p_card_filter text,p_training_filter jsonb,p_session_size text,p_new_review_ratio integer
) RETURNS TABLE(entry_id uuid,card_type_id text,queue_source text,session_ordinal integer)
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=public,private,pg_temp AS $$
 SELECT * FROM private.training_session_members_v1($1,$2,$3,$4,$5,$6,$7,$8,ARRAY[]::text[]);
$$;
REVOKE ALL ON FUNCTION private.training_session_members_v1(uuid,text[],uuid,text,text,jsonb,text,integer)
 FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.replan_training_session_remainder_v1(p_user_id uuid,p_session_id uuid)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path=public,private,pg_temp AS $$
DECLARE
  v_session public.training_sessions%rowtype;
  v_completed integer;
  v_remaining integer;
  v_ordinal integer;
  v_excluded text[];
  v_count integer;
BEGIN
  IF (select auth.uid()) IS NULL OR p_user_id IS DISTINCT FROM (select auth.uid()) THEN
    RAISE EXCEPTION 'unauthorized: user_id does not match authenticated user';
  END IF;
  -- Fast read keeps warm snapshots cheap; the locked read below is authoritative.
  IF NOT EXISTS (SELECT 1 FROM public.training_sessions s JOIN public.training_active_runs a ON a.session_id=s.id
    WHERE s.id=p_session_id AND s.user_id=p_user_id AND a.user_id=p_user_id
      AND s.exercise_family='meaning' AND s.completed_at IS NULL
      AND s.expires_at>private.training_reference_now_v1()
      AND s.external_state_revision>s.planned_state_revision) THEN RETURN false; END IF;
  PERFORM private.require_active_training_session_v1(p_user_id,p_session_id);
  SELECT * INTO v_session FROM public.training_sessions
    WHERE id=p_session_id AND user_id=p_user_id FOR UPDATE;
  IF v_session.external_state_revision<=v_session.planned_state_revision OR v_session.completed_at IS NOT NULL THEN RETURN false; END IF;
  SELECT count(*)::integer INTO v_completed FROM public.training_session_members
    WHERE session_id=p_session_id AND consumed_at IS NOT NULL;
  v_remaining:=GREATEST(v_session.requested_total-v_completed,0);
  INSERT INTO private.training_session_replan_history(session_id,revision,prior_members,replanned_at)
    SELECT p_session_id,v_session.external_state_revision,COALESCE(jsonb_agg(to_jsonb(m) ORDER BY ordinal),'[]'),private.training_reference_now_v1()
    FROM public.training_session_members m WHERE session_id=p_session_id AND consumed_at IS NULL AND unavailable_at IS NULL;
  DELETE FROM public.training_session_members WHERE session_id=p_session_id AND consumed_at IS NULL AND unavailable_at IS NULL;
  SELECT COALESCE(max(ordinal),0),COALESCE(array_agg(entry_id::text||':'||card_type_id),ARRAY[]::text[])
    INTO v_ordinal,v_excluded FROM public.training_session_members WHERE session_id=p_session_id;
  IF v_remaining>0 THEN
    INSERT INTO public.training_session_members(session_id,ordinal,entry_id,card_type_id,queue_source)
      SELECT p_session_id,v_ordinal+m.session_ordinal,m.entry_id,m.card_type_id,m.queue_source
      FROM private.training_session_members_v1(p_user_id,v_session.card_type_ids,v_session.list_id,v_session.list_type,
        v_session.card_filter,v_session.training_filter,v_remaining::text,v_session.new_review_ratio,v_excluded) m;
  END IF;
  -- Re-freeze contextual examples using the same rotation rule as migration175.
  IF v_session.training_filter->>'presentationMode'='word-in-context' THEN
    WITH examples AS (
      SELECT m.entry_id,n.id AS node_id,n.source_text_fingerprint,
        row_number() OVER(PARTITION BY m.entry_id ORDER BY n.source_order NULLS LAST,n.created_at,n.id)-1 AS example_index,
        count(*) OVER(PARTITION BY m.entry_id) AS example_count
      FROM public.training_session_members m JOIN private.platform_v2_content_nodes n ON n.entry_id=m.entry_id
      WHERE m.session_id=p_session_id AND m.consumed_at IS NULL AND m.unavailable_at IS NULL
        AND n.kind='example' AND n.binding_state='active'
        AND NULLIF(btrim(n.diagnostic_locator),'') IS NOT NULL
        AND n.diagnostic_locator ~ '^raw\.meanings\[[0-9]+\]\.examples\[[0-9]+\]$'
    ), chosen AS (
      SELECT e.* FROM examples e LEFT JOIN public.user_card_status s
        ON s.user_id=p_user_id AND s.entry_id=e.entry_id AND s.card_type_id='definition-to-word'
      WHERE e.example_index=mod(GREATEST(COALESCE(s.fsrs_reps,0),0)::bigint,e.example_count)
    ) UPDATE public.training_session_members m SET context_content_node_id=c.node_id,context_source_text_fingerprint=c.source_text_fingerprint
      FROM chosen c WHERE m.session_id=p_session_id AND m.entry_id=c.entry_id AND m.card_type_id='definition-to-word'
        AND m.consumed_at IS NULL AND m.unavailable_at IS NULL;
  END IF;
  SELECT count(*)::integer INTO v_count FROM public.training_session_members
    WHERE session_id=p_session_id AND consumed_at IS NULL AND unavailable_at IS NULL;
  UPDATE public.training_sessions SET planned_state_revision=external_state_revision,
    planned_total=v_completed+v_count,
    planned_new=(SELECT count(*)::integer FROM public.training_session_members WHERE session_id=p_session_id AND queue_source='new' AND (unavailable_at IS NULL OR consumed_at IS NOT NULL)),
    planned_review=(SELECT count(*)::integer FROM public.training_session_members WHERE session_id=p_session_id AND queue_source IN ('learning','review') AND (unavailable_at IS NULL OR consumed_at IS NOT NULL)),
    planned_practice=(SELECT count(*)::integer FROM public.training_session_members WHERE session_id=p_session_id AND queue_source='practice' AND (unavailable_at IS NULL OR consumed_at IS NOT NULL)),
    completed_at=CASE WHEN v_count=0 THEN private.training_reference_now_v1() ELSE NULL END,
    exhausted_at=CASE WHEN v_count=0 AND v_completed<requested_total THEN private.training_reference_now_v1() ELSE NULL END,
    completion_reason=CASE WHEN v_count=0 THEN CASE WHEN v_completed>=requested_total THEN 'completed' ELSE 'exhausted' END ELSE NULL END
    WHERE id=p_session_id;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION private.replan_training_session_remainder_v1(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.perform_platform_v2_card_action_as_principal(
  p_user_id uuid,
  p_action_id text,
  p_entry_id uuid,
  p_card_type_id text,
  p_state_revision text,
  p_active_known_mark_id uuid,
  p_known_mark_revision text,
  p_review_result text,
  p_client_event_id uuid,
  p_source_context jsonb,
  p_auth_kind text,
  p_connected_client_id text,
  p_training_session_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, extensions, pg_temp
AS $$
DECLARE
  v_receipt_exists boolean;
  v_response jsonb;
BEGIN
  IF COALESCE(
    NULLIF(current_setting('request.jwt.claim.role', true), ''),
    (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb)->>'role'
  ) IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;
  IF p_user_id IS NULL THEN RAISE EXCEPTION 'missing_user_id'; END IF;
  PERFORM set_config('request.jwt.claim.sub', p_user_id::text, true);

  -- Preserve shared receipt-before-active-run lock order across action families.
  PERFORM pg_advisory_xact_lock(hashtext(p_user_id::text || ':' || p_client_event_id::text));
  PERFORM pg_advisory_xact_lock(hashtext('training-active-run:' || p_user_id::text));

  -- The dedicated first-party Library server route passes an explicit null to
  -- identify an ordinary non-session action. Keep that trusted call path out
  -- of the 12-argument Connected Client compatibility overload.
  IF p_training_session_id IS NULL THEN
    v_response := private.perform_platform_v2_card_action_non_session_latch_v1(
      p_user_id, p_action_id, p_entry_id, p_card_type_id, p_state_revision,
      p_active_known_mark_id, p_known_mark_revision, p_review_result,
      p_client_event_id, p_source_context, p_auth_kind, p_connected_client_id
    );
    IF v_response->>'status'='accepted' THEN
      UPDATE public.training_sessions s SET external_state_revision=s.external_state_revision+1
      FROM public.training_active_runs a WHERE a.user_id=p_user_id AND a.session_id=s.id
        AND s.user_id=p_user_id AND s.exercise_family='meaning' AND s.completed_at IS NULL;
    END IF;
    RETURN v_response;
  END IF;

  -- A completed action remains reconcilable after a takeover. New actions are
  -- fenced before the underlying mutation sees them.
  PERFORM pg_advisory_xact_lock(
    hashtext(p_user_id::text || ':' || p_client_event_id::text)
  );
  SELECT EXISTS (
    SELECT 1 FROM public.platform_v2_action_receipts
    WHERE user_id = p_user_id AND client_event_id = p_client_event_id
  ) INTO v_receipt_exists;
  IF NOT v_receipt_exists THEN
    PERFORM private.replan_training_session_remainder_v1(p_user_id,p_training_session_id);
    PERFORM private.require_active_training_session_v1(
      p_user_id, p_training_session_id
    );
  END IF;

  RETURN private.perform_platform_v2_card_action_session_latch_v1(
    p_user_id, p_action_id, p_entry_id, p_card_type_id, p_state_revision,
    p_active_known_mark_id, p_known_mark_revision, p_review_result,
    p_client_event_id, p_source_context, p_auth_kind, p_connected_client_id,
    p_training_session_id
  );
END;
$$;


CREATE OR REPLACE FUNCTION public.get_next_training_session_card(
  p_user_id uuid,
  p_session_id uuid,
  p_exclude_card_keys text[]
)
RETURNS SETOF jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
BEGIN
  IF (select auth.uid()) IS NULL OR p_user_id IS DISTINCT FROM (select auth.uid()) THEN
    RAISE EXCEPTION 'unauthorized: user_id does not match authenticated user';
  END IF;
  PERFORM private.training_reference_now_v1();
  IF NOT EXISTS (
    SELECT 1 FROM public.training_active_runs
    WHERE user_id = p_user_id AND session_id = p_session_id
  ) THEN
    RETURN;
  END IF;
  PERFORM private.replan_training_session_remainder_v1(p_user_id,p_session_id);
  RETURN QUERY
  SELECT * FROM private.get_next_training_session_card_latch_v1(
    p_user_id, p_session_id, p_exclude_card_keys
  );
END;
$$;


CREATE OR REPLACE FUNCTION public.get_training_session_snapshot(
  p_user_id uuid,
  p_session_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE
  v_snapshot jsonb;
  v_run jsonb;
BEGIN
  IF (select auth.uid()) IS NULL OR p_user_id IS DISTINCT FROM (select auth.uid()) THEN
    RAISE EXCEPTION 'unauthorized: user_id does not match authenticated user';
  END IF;
  PERFORM private.replan_training_session_remainder_v1(p_user_id,p_session_id);
  v_snapshot := private.get_training_session_snapshot_latch_v1(p_user_id, p_session_id);
  IF v_snapshot IS NULL THEN RETURN NULL; END IF;
  v_run := private.training_session_run_response_v1(p_user_id, p_session_id);
  RETURN v_snapshot || jsonb_build_object(
    'planRevision', (SELECT planned_state_revision FROM public.training_sessions WHERE id=p_session_id AND user_id=p_user_id),
    'runStatus', v_run->>'runStatus',
    'runGeneration', v_run->'runGeneration'
  );
END;
$$;


ALTER FUNCTION public.get_next_training_session_card(uuid,uuid) VOLATILE;
COMMIT;
