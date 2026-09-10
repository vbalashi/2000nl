-- Latch the exact finite Training membership at session start.
-- This is intentionally additive: the UI still consumes the migration-132
-- selector until a follow-up wires the opaque session id into selection.

BEGIN;

CREATE TABLE IF NOT EXISTS public.training_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_size text NOT NULL CHECK (session_size IN ('5', '10', 'all-due-today')),
  card_type_ids text[] NOT NULL,
  list_id uuid,
  list_type text NOT NULL DEFAULT 'curated',
  card_filter text NOT NULL CHECK (card_filter IN ('new', 'review', 'both')),
  training_filter jsonb NOT NULL DEFAULT '{}'::jsonb,
  planned_new integer NOT NULL DEFAULT 0 CHECK (planned_new >= 0),
  planned_review integer NOT NULL DEFAULT 0 CHECK (planned_review >= 0),
  planned_practice integer NOT NULL DEFAULT 0 CHECK (planned_practice >= 0),
  planned_total integer NOT NULL DEFAULT 0 CHECK (planned_total >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS training_sessions_user_created_idx
  ON public.training_sessions(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.training_session_members (
  session_id uuid NOT NULL REFERENCES public.training_sessions(id) ON DELETE CASCADE,
  ordinal integer NOT NULL CHECK (ordinal > 0),
  entry_id uuid NOT NULL REFERENCES public.word_entries(id) ON DELETE RESTRICT,
  card_type_id text NOT NULL,
  queue_source text NOT NULL CHECK (queue_source IN ('new', 'learning', 'review')),
  consumed_at timestamptz,
  unavailable_at timestamptz,
  PRIMARY KEY (session_id, entry_id, card_type_id),
  UNIQUE (session_id, ordinal)
);

CREATE INDEX IF NOT EXISTS training_session_members_next_idx
  ON public.training_session_members(session_id, consumed_at, unavailable_at, ordinal);

ALTER TABLE public.training_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_session_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS training_sessions_select_self ON public.training_sessions;
CREATE POLICY training_sessions_select_self ON public.training_sessions
  FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS training_session_members_select_self ON public.training_session_members;
CREATE POLICY training_session_members_select_self ON public.training_session_members
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.training_sessions session
    WHERE session.id = training_session_members.session_id
      AND session.user_id = (select auth.uid())
  ));

CREATE OR REPLACE FUNCTION private.prevent_training_membership_identity_update_v1()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
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

DROP TRIGGER IF EXISTS training_session_members_identity_immutable
  ON public.training_session_members;
CREATE TRIGGER training_session_members_identity_immutable
BEFORE UPDATE OR DELETE ON public.training_session_members
FOR EACH ROW
EXECUTE FUNCTION private.prevent_training_membership_identity_update_v1();

CREATE OR REPLACE FUNCTION public.start_training_session(
  p_user_id uuid,
  p_card_type_ids text[] DEFAULT ARRAY['word-to-definition'],
  p_list_id uuid DEFAULT NULL,
  p_list_type text DEFAULT 'curated',
  p_card_filter text DEFAULT 'both',
  p_training_filter jsonb DEFAULT '{}',
  p_session_size text DEFAULT '10'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE
  v_session_id uuid := gen_random_uuid();
  v_filter jsonb := COALESCE(p_training_filter, '{}'::jsonb);
  v_filtered boolean;
  v_modes text[] := COALESCE(
    ARRAY(
      SELECT DISTINCT trim(mode)
      FROM unnest(COALESCE(p_card_type_ids, ARRAY['word-to-definition']::text[])) requested(mode)
      WHERE trim(mode) <> ''
      ORDER BY 1
    ),
    ARRAY['word-to-definition']::text[]
  );
  v_limit integer;
BEGIN
  IF (select auth.uid()) IS NULL OR p_user_id IS DISTINCT FROM (select auth.uid()) THEN
    RAISE EXCEPTION 'unauthorized: user_id does not match authenticated user';
  END IF;
  IF p_session_size NOT IN ('5', '10', 'all-due-today') THEN
    RAISE EXCEPTION 'invalid training session size: %', p_session_size;
  END IF;
  IF p_card_filter NOT IN ('new', 'review', 'both') THEN
    RAISE EXCEPTION 'invalid card filter: %', p_card_filter;
  END IF;
  IF cardinality(v_modes) = 0 THEN
    v_modes := ARRAY['word-to-definition']::text[];
  END IF;

  v_filtered := private.training_filter_target_date(v_filter) IS NOT NULL
    OR NULLIF(v_filter->>'sourceId', '') IS NOT NULL
    OR NULLIF(trim(v_filter->>'sourceKind'), '') IS NOT NULL
    OR NULLIF(trim(v_filter->>'externalId'), '') IS NOT NULL;
  v_limit := CASE WHEN p_session_size = 'all-due-today' THEN NULL ELSE p_session_size::integer END;

  INSERT INTO public.training_sessions (
    id, user_id, session_size, card_type_ids, list_id, list_type,
    card_filter, training_filter
  ) VALUES (
    v_session_id, p_user_id, p_session_size, v_modes, p_list_id,
    COALESCE(p_list_type, 'curated'), p_card_filter, v_filter
  );

  WITH candidates AS MATERIALIZED (
    SELECT candidate.entry_id, candidate.card_type_id, candidate.queue_source,
           candidate.selection_order
    FROM private.training_scheduler_candidates_v1(
      p_user_id, v_modes, p_list_id, COALESCE(p_list_type, 'curated'),
      p_card_filter, 'auto', ARRAY[]::uuid[], ARRAY[]::text[], v_filter,
      v_filtered, false
    ) candidate
    WHERE candidate.queue_source IN ('new', 'learning', 'review')
    ORDER BY candidate.selection_order
    LIMIT v_limit
  )
  INSERT INTO public.training_session_members (
    session_id, ordinal, entry_id, card_type_id, queue_source
  )
  SELECT v_session_id,
         row_number() OVER (ORDER BY candidates.selection_order),
         candidates.entry_id, candidates.card_type_id, candidates.queue_source
  FROM candidates;

  UPDATE public.training_sessions session
  SET planned_new = counts.planned_new,
      planned_review = counts.planned_review,
      planned_practice = 0,
      planned_total = counts.planned_total
  FROM (
    SELECT count(*) FILTER (WHERE queue_source = 'new')::integer planned_new,
           count(*) FILTER (WHERE queue_source IN ('learning', 'review'))::integer planned_review,
           count(*)::integer planned_total
    FROM public.training_session_members member
    WHERE member.session_id = v_session_id
  ) counts
  WHERE session.id = v_session_id;

  RETURN (
    SELECT jsonb_build_object(
      'sessionId', session.id,
      'sessionSize', session.session_size,
      'plannedNew', session.planned_new,
      'plannedReview', session.planned_review,
      'plannedPractice', session.planned_practice,
      'plannedTotal', session.planned_total,
      'plannedAt', session.created_at
    )
    FROM public.training_sessions session
    WHERE session.id = v_session_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_training_session_snapshot(
  p_user_id uuid,
  p_session_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE
  v_session public.training_sessions%rowtype;
BEGIN
  IF (select auth.uid()) IS NULL OR p_user_id IS DISTINCT FROM (select auth.uid()) THEN
    RAISE EXCEPTION 'unauthorized: user_id does not match authenticated user';
  END IF;
  SELECT * INTO v_session
  FROM public.training_sessions
  WHERE id = p_session_id AND user_id = p_user_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  RETURN jsonb_build_object(
    'sessionId', v_session.id,
    'sessionSize', v_session.session_size,
    'plannedNew', v_session.planned_new,
    'plannedReview', v_session.planned_review,
    'plannedPractice', v_session.planned_practice,
    'plannedTotal', v_session.planned_total,
    'plannedAt', v_session.created_at,
    'members', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'ordinal', member.ordinal,
        'entryId', member.entry_id,
        'cardTypeId', member.card_type_id,
        'queueSource', member.queue_source,
        'consumedAt', member.consumed_at,
        'unavailableAt', member.unavailable_at
      ) ORDER BY member.ordinal)
      FROM public.training_session_members member
      WHERE member.session_id = v_session.id
    ), '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON TABLE public.training_sessions, public.training_session_members
  FROM PUBLIC, anon, service_role;
GRANT SELECT ON TABLE public.training_sessions, public.training_session_members TO authenticated;
REVOKE ALL ON FUNCTION public.start_training_session(uuid,text[],uuid,text,text,jsonb,text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_training_session(uuid,text[],uuid,text,text,jsonb,text)
  TO authenticated;
REVOKE ALL ON FUNCTION public.get_training_session_snapshot(uuid,uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_training_session_snapshot(uuid,uuid)
  TO authenticated;

COMMIT;
