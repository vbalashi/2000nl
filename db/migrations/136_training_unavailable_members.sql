-- Make permanent Training membership failures explicit and recoverable.
-- A session member is only unavailable when the server has evidence that its
-- dictionary access or presentation can no longer succeed. Transient lookup
-- failures remain retryable in the client and never reach this boundary.

BEGIN;

ALTER TABLE public.training_session_members
  ADD COLUMN IF NOT EXISTS unavailable_reason text;

ALTER TABLE public.training_session_members
  DROP CONSTRAINT IF EXISTS training_session_members_unavailable_reason_check;

ALTER TABLE public.training_session_members
  ADD CONSTRAINT training_session_members_unavailable_reason_check
  CHECK (
    (unavailable_at IS NULL AND unavailable_reason IS NULL)
    OR (unavailable_at IS NOT NULL AND unavailable_reason IS NOT NULL)
  );

COMMENT ON COLUMN public.training_session_members.unavailable_reason IS
  'Stable server reason for excluding a latched member from this session; never set for transient failures.';

CREATE OR REPLACE FUNCTION private.mark_training_session_member_unavailable(
  p_user_id uuid,
  p_session_id uuid,
  p_entry_id uuid,
  p_card_type_id text,
  p_reason text,
  p_allow_out_of_order boolean DEFAULT false
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
  v_projected_card jsonb;
  v_platform_group jsonb;
  v_evidence_reason text;
  v_remaining integer;
BEGIN
  IF (select auth.uid()) IS NULL OR p_user_id IS DISTINCT FROM (select auth.uid()) THEN
    RAISE EXCEPTION 'unauthorized: user_id does not match authenticated user';
  END IF;

  IF p_reason NOT IN (
    'dictionary-access-revoked',
    'projection-missing',
    'entry-not-found',
    'model-invalid',
    'reverse-definition-missing'
  ) THEN
    RAISE EXCEPTION 'invalid training session unavailable reason: %', p_reason;
  END IF;

  -- Serialize status changes with accepted card actions. This also makes the
  -- remaining count and completion transition deterministic under retries.
  SELECT * INTO v_session
  FROM public.training_sessions session
  WHERE session.id = p_session_id
    AND session.user_id = p_user_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'not-member');
  END IF;

  SELECT member.* INTO v_member
  FROM public.training_session_members member
  WHERE member.session_id = p_session_id
    AND member.entry_id = p_entry_id
    AND member.card_type_id = p_card_type_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'not-member');
  END IF;
  IF v_member.consumed_at IS NOT NULL THEN
    RETURN jsonb_build_object(
      'status', 'consumed',
      'ordinal', v_member.ordinal
    );
  END IF;
  IF v_member.unavailable_at IS NOT NULL THEN
    RETURN jsonb_build_object(
      'status', 'unavailable',
      'ordinal', v_member.ordinal,
      'reason', v_member.unavailable_reason
    );
  END IF;

  -- Do not let a client retire an otherwise valid member by naming an
  -- arbitrary allowed reason. Re-check the current server state at the
  -- mutation boundary. The selector is read-only, so this check is the
  -- authoritative evidence that makes the retirement legal.
  SELECT entry.* INTO v_entry
  FROM public.word_entries entry
  WHERE entry.id = v_member.entry_id;
  IF NOT FOUND THEN
    v_evidence_reason := 'entry-not-found';
  ELSIF NOT (
    v_entry.dictionary_id IS NULL
    OR public.can_access_dictionary(p_user_id, v_entry.dictionary_id)
  ) THEN
    v_evidence_reason := 'dictionary-access-revoked';
  ELSE
    v_projected_card := private.project_training_scheduler_candidate_v1(
      p_user_id,
      v_member.entry_id,
      v_member.card_type_id,
      v_member.queue_source,
      COALESCE(v_session.training_filter, '{}'::jsonb),
      private.training_filter_target_date(COALESCE(v_session.training_filter, '{}'::jsonb)) IS NOT NULL
        OR NULLIF(COALESCE(v_session.training_filter, '{}'::jsonb)->>'sourceId', '') IS NOT NULL
        OR NULLIF(trim(COALESCE(v_session.training_filter, '{}'::jsonb)->>'sourceKind'), '') IS NOT NULL
        OR NULLIF(trim(COALESCE(v_session.training_filter, '{}'::jsonb)->>'externalId'), '') IS NOT NULL,
      0,
      0,
      0,
      0,
      0
    );
    IF v_projected_card IS NULL THEN
      v_evidence_reason := 'projection-missing';
    ELSIF jsonb_typeof(v_entry.raw) IS DISTINCT FROM 'object' THEN
      v_evidence_reason := 'model-invalid';
    ELSIF jsonb_typeof(v_entry.raw->'meanings') IS DISTINCT FROM 'array' THEN
      v_evidence_reason := 'model-invalid';
    ELSIF v_member.card_type_id = 'definition-to-word'
      AND NOT EXISTS (
        SELECT 1
        FROM jsonb_array_elements(COALESCE(v_entry.raw->'meanings', '[]'::jsonb)) meaning
        WHERE NULLIF(trim(meaning->>'definition'), '') IS NOT NULL
      ) THEN
      v_evidence_reason := 'reverse-definition-missing';
    ELSE
      -- The Platform V2 renderer depends on the same presentation identity
      -- contract as the UI lookup route. A dictionary row can be present while
      -- its headword group/bindings have been retired, which is a permanent
      -- projection failure even though the scheduler projection still exists.
      v_platform_group := public.read_platform_v2_training_group(
        p_user_id,
        v_member.entry_id,
        50
      );
      IF v_platform_group->>'error' = 'presentation_identity_incomplete'
         OR NOT EXISTS (
           SELECT 1
           FROM jsonb_array_elements(COALESCE(v_platform_group->'items', '[]'::jsonb)) item
           WHERE item->>'id' = v_member.entry_id::text
         ) THEN
        v_evidence_reason := 'projection-missing';
      END IF;
    END IF;
  END IF;

  IF v_evidence_reason IS DISTINCT FROM p_reason THEN
    RAISE EXCEPTION
      'training session unavailable evidence mismatch: requested %, observed %',
      p_reason,
      COALESCE(v_evidence_reason, 'member-renderable');
  END IF;

  IF NOT p_allow_out_of_order THEN
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
        'status', 'out-of-order',
        'ordinal', v_member.ordinal,
        'expectedOrdinal', v_expected_member.ordinal
      );
    END IF;
  END IF;

  UPDATE public.training_session_members
  SET unavailable_at = now(),
      unavailable_reason = p_reason
  WHERE session_id = v_member.session_id
    AND ordinal = v_member.ordinal;

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
  uuid, uuid, uuid, text, text, boolean
) OWNER TO postgres;
REVOKE ALL ON FUNCTION private.mark_training_session_member_unavailable(
  uuid, uuid, uuid, text, text, boolean
) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.mark_training_session_member_unavailable(
  p_user_id uuid,
  p_session_id uuid,
  p_entry_id uuid,
  p_card_type_id text,
  p_reason text
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
  SELECT private.mark_training_session_member_unavailable(
    p_user_id,
    p_session_id,
    p_entry_id,
    p_card_type_id,
    p_reason,
    false
  );
$$;

ALTER FUNCTION public.mark_training_session_member_unavailable(
  uuid, uuid, uuid, text, text
) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.mark_training_session_member_unavailable(
  uuid, uuid, uuid, text, text
) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.mark_training_session_member_unavailable(
  uuid, uuid, uuid, text, text
) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_next_training_session_card(
  p_user_id uuid,
  p_session_id uuid,
  p_exclude_card_keys text[]
)
RETURNS SETOF jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE
  v_session public.training_sessions%rowtype;
  v_member public.training_session_members%rowtype;
  v_filter jsonb;
  v_filtered boolean;
  v_card jsonb;
  v_card_key text;
BEGIN
  IF (select auth.uid()) IS NULL OR p_user_id IS DISTINCT FROM (select auth.uid()) THEN
    RAISE EXCEPTION 'unauthorized: user_id does not match authenticated user';
  END IF;

  SELECT * INTO v_session
  FROM public.training_sessions
  WHERE id = p_session_id
    AND user_id = p_user_id
    AND completed_at IS NULL
    AND expires_at > now();
  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Walk the latched order. A permanent access/projection failure is returned
  -- as a diagnostic for the explicit mutation RPC. The selector remains a
  -- read-only lookup: it never changes membership or session completion.
  FOR v_member IN
    SELECT member.*
    FROM public.training_session_members member
    WHERE member.session_id = v_session.id
      AND member.consumed_at IS NULL
      AND member.unavailable_at IS NULL
    ORDER BY member.ordinal
  LOOP
    v_card_key := v_member.entry_id::text || ':' || v_member.card_type_id;
    IF v_card_key = ANY(COALESCE(p_exclude_card_keys, ARRAY[]::text[])) THEN
      CONTINUE;
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM public.word_entries entry
      WHERE entry.id = v_member.entry_id
    ) THEN
      RETURN NEXT jsonb_build_object(
        'trainingSessionUnavailable', true,
        'trainingSessionId', v_session.id,
        'trainingSessionOrdinal', v_member.ordinal,
        'entryId', v_member.entry_id,
        'cardTypeId', v_member.card_type_id,
        'reason', 'entry-not-found'
      );
      RETURN;
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM public.word_entries entry
      WHERE entry.id = v_member.entry_id
        AND (
          entry.dictionary_id IS NULL
          OR public.can_access_dictionary(p_user_id, entry.dictionary_id)
        )
    ) THEN
      RETURN NEXT jsonb_build_object(
        'trainingSessionUnavailable', true,
        'trainingSessionId', v_session.id,
        'trainingSessionOrdinal', v_member.ordinal,
        'entryId', v_member.entry_id,
        'cardTypeId', v_member.card_type_id,
        'reason', 'dictionary-access-revoked'
      );
      RETURN;
    END IF;

    v_filter := COALESCE(v_session.training_filter, '{}'::jsonb);
    v_filtered := private.training_filter_target_date(v_filter) IS NOT NULL
      OR NULLIF(v_filter->>'sourceId', '') IS NOT NULL
      OR NULLIF(trim(v_filter->>'sourceKind'), '') IS NOT NULL
      OR NULLIF(trim(v_filter->>'externalId'), '') IS NOT NULL;

    v_card := private.project_training_scheduler_candidate_v1(
      p_user_id,
      v_member.entry_id,
      v_member.card_type_id,
      v_member.queue_source,
      v_filter,
      v_filtered,
      0,
      0,
      0,
      0,
      0
    );
    IF v_card IS NULL THEN
      RETURN NEXT jsonb_build_object(
        'trainingSessionUnavailable', true,
        'trainingSessionId', v_session.id,
        'trainingSessionOrdinal', v_member.ordinal,
        'entryId', v_member.entry_id,
        'cardTypeId', v_member.card_type_id,
        'reason', 'projection-missing'
      );
      RETURN;
    END IF;

    RETURN NEXT v_card || jsonb_build_object(
      'trainingSessionId', v_session.id,
      'trainingSessionOrdinal', v_member.ordinal
    );
    RETURN;
  END LOOP;
END;
$$;

ALTER FUNCTION public.get_next_training_session_card(uuid, uuid, text[])
  OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_next_training_session_card(uuid, uuid, text[])
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.get_next_training_session_card(uuid, uuid, text[])
  TO authenticated;

CREATE OR REPLACE FUNCTION public.get_next_training_session_card(
  p_user_id uuid,
  p_session_id uuid
)
RETURNS SETOF jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
  SELECT *
  FROM public.get_next_training_session_card(
    p_user_id,
    p_session_id,
    ARRAY[]::text[]
  );
$$;

ALTER FUNCTION public.get_next_training_session_card(uuid, uuid)
  OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_next_training_session_card(uuid, uuid)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.get_next_training_session_card(uuid, uuid)
  TO authenticated;

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
        'unavailableAt', member.unavailable_at,
        'unavailableReason', member.unavailable_reason
      ) ORDER BY member.ordinal)
      FROM public.training_session_members member
      WHERE member.session_id = v_session.id
    ), '[]'::jsonb)
  );
END;
$$;

ALTER FUNCTION public.get_training_session_snapshot(uuid, uuid)
  OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_training_session_snapshot(uuid, uuid)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.get_training_session_snapshot(uuid, uuid)
  TO authenticated;

COMMIT;
