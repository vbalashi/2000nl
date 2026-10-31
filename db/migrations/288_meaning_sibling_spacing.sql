-- Space opposite directions by three intervening cards when candidates permit.
-- Fresh-install application migration; managed upgrades require their separate release path.

-- Ordering only: no review, due-time or learning-state writes.
CREATE FUNCTION private.space_meaning_training_candidates_v1(
  p_candidates jsonb, p_requested_total integer, p_ratio integer,
  p_recent_entry_ids uuid[] DEFAULT ARRAY[]::uuid[]
) RETURNS TABLE(entry_id uuid, card_type_id text, queue_source text, session_ordinal integer)
LANGUAGE plpgsql IMMUTABLE SET search_path TO 'pg_catalog', 'private'
AS $$
DECLARE
  v_entries uuid[];
  v_types text[];
  v_sources text[];
  v_categories integer[];
  v_taken boolean[];
  v_heads integer[] := ARRAY[1,1];
  v_recent uuid[] := COALESCE(p_recent_entry_ids,ARRAY[]::uuid[]);
  v_count integer;
  v_total integer;
  v_phase integer := 0;
  v_preferred integer;
  v_category integer;
  v_scan integer;
  v_chosen integer;
  v_fallback integer;
  v_oldest integer;
  v_position integer;
BEGIN
  SELECT array_agg(c.entry_id ORDER BY c.ordinality),
    array_agg(c.card_type_id ORDER BY c.ordinality),
    array_agg(c.queue_source ORDER BY c.ordinality),
    array_agg(CASE WHEN c.queue_source='new' THEN 1 ELSE 2 END ORDER BY c.ordinality)
  INTO v_entries,v_types,v_sources,v_categories
  FROM (SELECT (value->>'entry_id')::uuid entry_id,value->>'card_type_id' card_type_id,
      value->>'queue_source' queue_source,ordinality
    FROM jsonb_array_elements(p_candidates) WITH ORDINALITY) c;
  v_count := COALESCE(cardinality(v_entries),0);
  v_total := LEAST(COALESCE(p_requested_total,v_count),v_count);
  v_taken := array_fill(false,ARRAY[v_count]);
  -- Only the last three displayed cards constrain the next selection.
  v_recent := v_recent[GREATEST(cardinality(v_recent)-2,1):cardinality(v_recent)];
  FOR v_position IN 1..v_total LOOP
    v_preferred := CASE WHEN v_phase=0 THEN 1 ELSE 2 END;
    v_chosen := NULL;
    v_fallback := NULL;
    v_oldest := 4;
    FOREACH v_category IN ARRAY ARRAY[v_preferred,3-v_preferred] LOOP
      v_scan := v_heads[v_category];
      WHILE v_scan<=v_count LOOP
        IF NOT v_taken[v_scan] AND v_categories[v_scan]=v_category THEN
          IF NOT (v_entries[v_scan]=ANY(v_recent)) THEN
            v_chosen := v_scan;
            EXIT;
          END IF;
          -- If every remaining candidate conflicts, prefer the least recent
          -- meaning. Never drop cards or idle waiting for more material.
          IF array_position(v_recent,v_entries[v_scan])<v_oldest THEN
            v_oldest := array_position(v_recent,v_entries[v_scan]);
            v_fallback := v_scan;
          END IF;
        ELSIF v_scan=v_heads[v_category] THEN
          v_heads[v_category] := v_scan+1;
        END IF;
        v_scan := v_scan+1;
      END LOOP;
      EXIT WHEN v_chosen IS NOT NULL;
    END LOOP;
    v_chosen := COALESCE(v_chosen,v_fallback);
    EXIT WHEN v_chosen IS NULL;
    v_taken[v_chosen] := true;
    v_recent := v_recent || v_entries[v_chosen];
    v_recent := v_recent[GREATEST(cardinality(v_recent)-2,1):cardinality(v_recent)];
    v_phase := CASE WHEN v_categories[v_chosen]=1 THEN 1
      WHEN v_phase>=p_ratio THEN 0 ELSE v_phase+1 END;
    entry_id := v_entries[v_chosen];
    card_type_id := v_types[v_chosen];
    queue_source := v_sources[v_chosen];
    session_ordinal := v_position;
    RETURN NEXT;
  END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION private.space_meaning_training_candidates_v1(jsonb,integer,integer,uuid[]) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.training_session_members_v1(p_user_id uuid, p_card_type_ids text[], p_list_id uuid, p_list_type text, p_card_filter text, p_training_filter jsonb, p_session_size text, p_new_review_ratio integer, p_exclude_card_keys text[], p_recent_entry_ids uuid[]) RETURNS TABLE(entry_id uuid, card_type_id text, queue_source text, session_ordinal integer)
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public', 'private', 'pg_temp'
    AS $$
WITH requested AS (
  SELECT CASE WHEN p_session_size = 'all-due-today' THEN NULL
              ELSE p_session_size::integer END AS requested_total
), candidates AS MATERIALIZED (
  SELECT candidate.entry_id,
    candidate.card_type_id,
    candidate.queue_source,
    candidate.selection_order
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
), ordered AS (
  SELECT jsonb_agg(jsonb_build_object('entry_id',entry_id,'card_type_id',card_type_id,
    'queue_source',queue_source) ORDER BY selection_order) AS items FROM candidates
)
SELECT spaced.* FROM ordered CROSS JOIN requested
CROSS JOIN LATERAL private.space_meaning_training_candidates_v1(
  COALESCE(ordered.items,'[]'::jsonb),requested.requested_total,p_new_review_ratio,p_recent_entry_ids
) spaced;
$$;

REVOKE ALL ON FUNCTION private.training_session_members_v1(uuid,text[],uuid,text,text,jsonb,text,integer,text[],uuid[]) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.training_session_members_v1(p_user_id uuid, p_card_type_ids text[], p_list_id uuid, p_list_type text, p_card_filter text, p_training_filter jsonb, p_session_size text, p_new_review_ratio integer, p_exclude_card_keys text[]) RETURNS TABLE(entry_id uuid, card_type_id text, queue_source text, session_ordinal integer)
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public', 'private', 'pg_temp'
    AS $$
SELECT * FROM private.training_session_members_v1($1,$2,$3,$4,$5,$6,$7,$8,$9,ARRAY[]::uuid[]);
$$;

CREATE OR REPLACE FUNCTION private.training_session_members_v1(p_user_id uuid, p_card_type_ids text[], p_list_id uuid, p_list_type text, p_card_filter text, p_training_filter jsonb, p_session_size text) RETURNS TABLE(entry_id uuid, card_type_id text, queue_source text, session_ordinal integer)
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public', 'private', 'pg_temp'
    AS $$
SELECT * FROM private.training_session_members_v1($1,$2,$3,$4,$5,$6,$7,
  COALESCE((SELECT LEAST(5,GREATEST(1,new_review_ratio)) FROM public.user_settings WHERE user_id=$1),2),
  ARRAY[]::text[]);
$$;

CREATE OR REPLACE FUNCTION private.replan_training_session_remainder_v1(p_user_id uuid, p_session_id uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'private', 'pg_temp'
    AS $_$
DECLARE
  v_session public.training_sessions%rowtype;
  v_completed integer;
  v_remaining integer;
  v_ordinal integer;
  v_excluded text[];
  v_count integer;
  v_recent uuid[];
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
  SELECT COALESCE(array_agg(recent.entry_id ORDER BY recent.consumed_at,recent.ordinal),ARRAY[]::uuid[])
    INTO v_recent FROM (
      SELECT entry_id,consumed_at,ordinal FROM public.training_session_members
      WHERE session_id=p_session_id AND consumed_at IS NOT NULL
      ORDER BY consumed_at DESC,ordinal DESC LIMIT 3
    ) recent;
  IF v_remaining>0 THEN
    INSERT INTO public.training_session_members(session_id,ordinal,entry_id,card_type_id,queue_source)
      SELECT p_session_id,v_ordinal+m.session_ordinal,m.entry_id,m.card_type_id,m.queue_source
      FROM private.training_session_members_v1(p_user_id,v_session.card_type_ids,v_session.list_id,v_session.list_type,
        v_session.card_filter,v_session.training_filter,v_remaining::text,v_session.new_review_ratio,v_excluded,v_recent) m;
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
$_$;
