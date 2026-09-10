-- Keep Training selection inside the server-latched membership.
-- This migration adds the read/consume boundary used by the next UI slice;
-- the current client remains on the migration-132 selector until that
-- boundary is wired end to end.

BEGIN;

CREATE OR REPLACE FUNCTION public.get_next_training_session_card(
  p_user_id uuid,
  p_session_id uuid
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

  SELECT member.* INTO v_member
  FROM public.training_session_members member
  WHERE member.session_id = v_session.id
    AND member.consumed_at IS NULL
    AND member.unavailable_at IS NULL
  ORDER BY member.ordinal
  LIMIT 1;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Membership is latched, but dictionary access is still checked at read
  -- time. A revoked entitlement must never leak the raw entry through this
  -- SECURITY DEFINER projection.
  IF NOT EXISTS (
    SELECT 1
    FROM public.word_entries entry
    WHERE entry.id = v_member.entry_id
      AND (
        entry.dictionary_id IS NULL
        OR public.can_access_dictionary(p_user_id, entry.dictionary_id)
      )
  ) THEN
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
    RETURN;
  END IF;

  RETURN NEXT v_card || jsonb_build_object(
    'trainingSessionId', v_session.id,
    'trainingSessionOrdinal', v_member.ordinal
  );
END;
$$;

ALTER FUNCTION public.get_next_training_session_card(uuid, uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_next_training_session_card(uuid, uuid)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.get_next_training_session_card(uuid, uuid)
  TO authenticated;

CREATE OR REPLACE FUNCTION private.consume_training_session_member(
  p_user_id uuid,
  p_session_id uuid,
  p_entry_id uuid,
  p_card_type_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE
  v_member public.training_session_members%rowtype;
  v_expected_member public.training_session_members%rowtype;
  v_remaining integer;
  v_status text;
BEGIN
  IF (select auth.uid()) IS NULL OR p_user_id IS DISTINCT FROM (select auth.uid()) THEN
    RAISE EXCEPTION 'unauthorized: user_id does not match authenticated user';
  END IF;

  -- Serialize all consumption for a session. Without the parent lock, two
  -- concurrent members can both observe a non-empty remainder and leave the
  -- session incomplete after the last two actions commit.
  PERFORM 1
  FROM public.training_sessions session
  WHERE session.id = p_session_id
    AND session.user_id = p_user_id
  FOR UPDATE;

  SELECT member.* INTO v_member
  FROM public.training_session_members member
  JOIN public.training_sessions session ON session.id = member.session_id
  WHERE member.session_id = p_session_id
    AND member.entry_id = p_entry_id
    AND member.card_type_id = p_card_type_id
    AND session.user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'not-member');
  END IF;
  IF v_member.consumed_at IS NOT NULL THEN
    RETURN jsonb_build_object(
      'status', 'duplicate',
      'ordinal', v_member.ordinal
    );
  END IF;
  IF v_member.unavailable_at IS NOT NULL THEN
    RETURN jsonb_build_object(
      'status', 'unavailable',
      'ordinal', v_member.ordinal
    );
  END IF;

  -- A session is an ordered queue. An accepted action may only consume the
  -- first still-available member; otherwise a stale or replayed client could
  -- skip cards while making the snapshot appear complete.
  SELECT member.* INTO v_expected_member
  FROM public.training_session_members member
  WHERE member.session_id = v_member.session_id
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

  UPDATE public.training_session_members
  SET consumed_at = now()
  WHERE session_id = v_member.session_id
    AND entry_id = v_member.entry_id
    AND card_type_id = v_member.card_type_id;

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

  v_status := CASE WHEN v_remaining = 0 THEN 'consumed-complete' ELSE 'consumed' END;
  RETURN jsonb_build_object(
    'status', v_status,
    'ordinal', v_member.ordinal,
    'remaining', v_remaining
  );
END;
$$;

ALTER FUNCTION private.consume_training_session_member(uuid, uuid, uuid, text)
  OWNER TO postgres;
REVOKE ALL ON FUNCTION private.consume_training_session_member(uuid, uuid, uuid, text)
  FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS public.training_session_action_bindings (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_event_id uuid NOT NULL,
  session_id uuid NOT NULL REFERENCES public.training_sessions(id) ON DELETE CASCADE,
  entry_id uuid NOT NULL,
  card_type_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, client_event_id)
);

ALTER TABLE public.training_session_action_bindings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.training_session_action_bindings
  FROM PUBLIC, anon, authenticated, service_role;

-- The service-principal action boundary consumes membership in the same
-- transaction as the accepted card action. The 12-argument overload remains
-- available for non-session clients while the 13-argument overload is used by
-- the Training session client.
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
    v_jwt_role text := COALESCE(
        NULLIF(current_setting('request.jwt.claim.role', true), ''),
        (
            NULLIF(current_setting('request.jwt.claims', true), '')::jsonb
        )->>'role'
    );
    v_response jsonb;
    v_consumption jsonb;
    v_binding public.training_session_action_bindings%rowtype;
BEGIN
    IF v_jwt_role IS DISTINCT FROM 'service_role' THEN
        RAISE EXCEPTION 'unauthorized';
    END IF;
    IF p_user_id IS NULL THEN
        RAISE EXCEPTION 'missing_user_id';
    END IF;

    PERFORM set_config('request.jwt.claim.sub', p_user_id::text, true);

    v_response := public.perform_platform_v2_card_action_as_principal(
        p_user_id,
        p_action_id,
        p_entry_id,
        p_card_type_id,
        p_state_revision,
        p_active_known_mark_id,
        p_known_mark_revision,
        p_review_result,
        p_client_event_id,
        p_source_context,
        p_auth_kind,
        p_connected_client_id
    );

    IF p_training_session_id IS NOT NULL
       AND p_action_id IN ('start-learning', 'mark-known', 'review-card')
       AND v_response->>'status' IN ('accepted', 'duplicate') THEN
      IF v_response->>'status' = 'accepted' THEN
        INSERT INTO public.training_session_action_bindings (
          user_id, client_event_id, session_id, entry_id, card_type_id
        ) VALUES (
          p_user_id, p_client_event_id, p_training_session_id,
          p_entry_id, p_card_type_id
        ) ON CONFLICT (user_id, client_event_id) DO NOTHING;
      END IF;

      SELECT * INTO v_binding
      FROM public.training_session_action_bindings binding
      WHERE binding.user_id = p_user_id
        AND binding.client_event_id = p_client_event_id
      FOR UPDATE;
      IF NOT FOUND
         OR v_binding.user_id IS DISTINCT FROM p_user_id
         OR v_binding.session_id IS DISTINCT FROM p_training_session_id
         OR v_binding.entry_id IS DISTINCT FROM p_entry_id
         OR v_binding.card_type_id IS DISTINCT FROM p_card_type_id THEN
        RAISE EXCEPTION 'training_session_action_binding_conflict';
      END IF;

      v_consumption := private.consume_training_session_member(
        p_user_id,
        p_training_session_id,
        p_entry_id,
        p_card_type_id
      );
      IF v_consumption->>'status' NOT IN (
        'consumed', 'consumed-complete', 'duplicate'
      ) THEN
        RAISE EXCEPTION 'training_session_member_not_available';
      END IF;
    END IF;

    RETURN v_response;
END;
$$;

ALTER FUNCTION public.perform_platform_v2_card_action_as_principal(
    uuid, text, uuid, text, text, uuid, text, text, uuid, jsonb, text, text, uuid
) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.perform_platform_v2_card_action_as_principal(
    uuid, text, uuid, text, text, uuid, text, text, uuid, jsonb, text, text, uuid
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.perform_platform_v2_card_action_as_principal(
    uuid, text, uuid, text, text, uuid, text, text, uuid, jsonb, text, text, uuid
) TO service_role;

COMMIT;
