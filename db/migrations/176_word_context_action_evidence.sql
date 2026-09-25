-- Attach context presentation evidence to the same ordinary action receipt.
BEGIN;

ALTER TABLE public.training_session_members
  ADD COLUMN IF NOT EXISTS context_hint_opened boolean NOT NULL DEFAULT false;

ALTER TABLE public.user_card_action_events
  ADD COLUMN IF NOT EXISTS presentation_mode text,
  ADD COLUMN IF NOT EXISTS presentation_content_node_id uuid,
  ADD COLUMN IF NOT EXISTS presentation_source_text_fingerprint text,
  ADD COLUMN IF NOT EXISTS presentation_hint_opened boolean;

CREATE OR REPLACE FUNCTION public.mark_training_word_context_hint_opened(
  p_user_id uuid, p_session_id uuid, p_entry_id uuid
) RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
BEGIN
  IF (select auth.uid()) IS NULL OR p_user_id IS DISTINCT FROM (select auth.uid()) THEN
    RAISE EXCEPTION 'unauthorized: user_id does not match authenticated user';
  END IF;
  UPDATE public.training_session_members AS member
  SET context_hint_opened = true
  FROM public.training_sessions AS session
  WHERE member.session_id = session.id
    AND session.id = p_session_id
    AND session.user_id = p_user_id
    AND session.training_filter->>'presentationMode' = 'word-in-context'
    AND session.superseded_at IS NULL
    AND member.entry_id = p_entry_id
    AND member.card_type_id = 'definition-to-word'
    AND member.context_content_node_id IS NOT NULL
    AND member.consumed_at IS NULL
    AND member.unavailable_at IS NULL;
  RETURN FOUND;
END;
$$;
ALTER FUNCTION public.mark_training_word_context_hint_opened(uuid,uuid,uuid)
  OWNER TO postgres;
REVOKE ALL ON FUNCTION public.mark_training_word_context_hint_opened(uuid,uuid,uuid)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.mark_training_word_context_hint_opened(uuid,uuid,uuid)
  TO authenticated;

CREATE OR REPLACE FUNCTION pg_temp.patch_word_context_evidence(
  p_signature text, p_before text, p_after text
) RETURNS void LANGUAGE plpgsql AS $$
DECLARE definition text;
BEGIN
  SELECT pg_get_functiondef(p_signature::regprocedure) INTO definition;
  IF strpos(definition,p_after)>0 THEN RETURN; END IF;
  IF (length(definition)-length(replace(definition,p_before,'')))/length(p_before) <> 1 THEN
    RAISE EXCEPTION 'word-context evidence migration unexpected baseline: %',p_signature;
  END IF;
  EXECUTE replace(definition,p_before,p_after);
END;
$$;

SELECT pg_temp.patch_word_context_evidence(
  'private.perform_platform_v2_card_action_session_latch_v1(uuid,text,uuid,text,text,uuid,text,text,uuid,jsonb,text,text,uuid)',
$before$  RETURN v_response;
END;$before$,
$after$  IF v_response->>'status' = 'accepted'
     AND p_action_id IN ('start-learning', 'review-card', 'mark-known') THEN
    UPDATE public.user_card_action_events AS event
    SET presentation_mode = 'word-in-context',
        presentation_content_node_id = member.context_content_node_id,
        presentation_source_text_fingerprint = member.context_source_text_fingerprint,
        presentation_hint_opened = member.context_hint_opened
    FROM public.training_sessions AS session
    JOIN public.training_session_members AS member
      ON member.session_id = session.id
    WHERE session.id = p_training_session_id
      AND session.user_id = p_user_id
      AND session.training_filter->>'presentationMode' = 'word-in-context'
      AND member.entry_id = p_entry_id
      AND member.card_type_id = p_card_type_id
      AND member.context_content_node_id IS NOT NULL
      AND event.id = (v_response->>'eventId')::uuid
      AND event.user_id = p_user_id;
  END IF;

  RETURN v_response;
END;$after$);

COMMIT;
