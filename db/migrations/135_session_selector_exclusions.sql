-- Keep speculative session selection behind the same exclusion contract as the
-- ordinary scheduler. Reads do not consume membership; callers must be able to
-- ask for a later member while the current card is still on screen.

BEGIN;

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
    AND NOT ((member.entry_id::text || ':' || member.card_type_id) = ANY(
      COALESCE(p_exclude_card_keys, ARRAY[]::text[])
    ))
    AND EXISTS (
      SELECT 1
      FROM public.word_entries entry
      WHERE entry.id = member.entry_id
        AND (
          entry.dictionary_id IS NULL
          OR public.can_access_dictionary(p_user_id, entry.dictionary_id)
        )
    )
  ORDER BY member.ordinal
  LIMIT 1;
  IF NOT FOUND THEN
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

ALTER FUNCTION public.get_next_training_session_card(uuid, uuid, text[])
  OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_next_training_session_card(uuid, uuid, text[])
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.get_next_training_session_card(uuid, uuid, text[])
  TO authenticated;

-- Preserve the two-argument contract for callers that do not need speculative
-- exclusions while routing it through the same implementation.
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

COMMIT;
