-- Freeze the exact example used to present each ordinary reverse member.
-- The cursor derives from the existing reverse review count; no example FSRS
-- or second scheduling state is introduced.
BEGIN;

ALTER TABLE public.training_session_members
  ADD COLUMN IF NOT EXISTS context_content_node_id uuid
    REFERENCES private.platform_v2_content_nodes(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS context_source_text_fingerprint text;

CREATE OR REPLACE FUNCTION pg_temp.patch_word_context_source(
  p_signature text, p_before text, p_after text
) RETURNS void LANGUAGE plpgsql AS $$
DECLARE definition text;
BEGIN
  SELECT pg_get_functiondef(p_signature::regprocedure) INTO definition;
  IF strpos(definition,p_after)>0 THEN RETURN; END IF;
  IF (length(definition)-length(replace(definition,p_before,'')))/length(p_before) <> 1 THEN
    RAISE EXCEPTION 'word-context source migration unexpected baseline: %',p_signature;
  END IF;
  EXECUTE replace(definition,p_before,p_after);
END;
$$;

SELECT pg_temp.patch_word_context_source(
  'private.start_training_session_latch_v1(uuid,text[],uuid,text,text,jsonb,text,integer)',
$before$  UPDATE public.training_sessions session
  SET planned_new = counts.planned_new,$before$,
$after$  IF v_filter->>'presentationMode' = 'word-in-context' THEN
    WITH examples AS (
      SELECT member.entry_id, node.id AS node_id,
             node.source_text_fingerprint,
             row_number() OVER (
               PARTITION BY member.entry_id
               ORDER BY node.source_order NULLS LAST, node.created_at, node.id
             ) - 1 AS example_index,
             count(*) OVER (PARTITION BY member.entry_id) AS example_count
      FROM public.training_session_members AS member
      JOIN private.platform_v2_content_nodes AS node
        ON node.entry_id = member.entry_id
       AND node.kind = 'example'
       AND node.binding_state = 'active'
       AND NULLIF(btrim(node.diagnostic_locator), '') IS NOT NULL
       AND node.diagnostic_locator ~ '^raw\.meanings\[[0-9]+\]\.examples\[[0-9]+\]$'
      WHERE member.session_id = v_session_id
    ), selected AS (
      SELECT examples.*
      FROM examples
      LEFT JOIN public.user_card_status AS reverse_state
        ON reverse_state.user_id = p_user_id
       AND reverse_state.entry_id = examples.entry_id
       AND reverse_state.card_type_id = 'definition-to-word'
      WHERE examples.example_index =
        mod(GREATEST(COALESCE(reverse_state.fsrs_reps,0),0)::bigint,
            examples.example_count)
    )
    UPDATE public.training_session_members AS member
    SET context_content_node_id = selected.node_id,
        context_source_text_fingerprint = selected.source_text_fingerprint
    FROM selected
    WHERE member.session_id = v_session_id
      AND member.entry_id = selected.entry_id
      AND member.card_type_id = 'definition-to-word';

    IF EXISTS (
      SELECT 1 FROM public.training_session_members AS member
      WHERE member.session_id = v_session_id
        AND (member.context_content_node_id IS NULL
          OR member.context_source_text_fingerprint IS NULL)
    ) THEN
      RAISE EXCEPTION 'word_context_example_unavailable';
    END IF;
  END IF;

  UPDATE public.training_sessions session
  SET planned_new = counts.planned_new,$after$);

CREATE OR REPLACE FUNCTION public.read_training_word_context_member(
  p_user_id uuid, p_session_id uuid, p_entry_id uuid
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE result jsonb;
BEGIN
  IF (select auth.uid()) IS NULL OR p_user_id IS DISTINCT FROM (select auth.uid()) THEN
    RAISE EXCEPTION 'unauthorized: user_id does not match authenticated user';
  END IF;
  SELECT jsonb_build_object(
    'entryId', member.entry_id,
    'contentNodeId', member.context_content_node_id,
    'sourceTextFingerprint', member.context_source_text_fingerprint
  ) INTO result
  FROM public.training_sessions AS session
  JOIN public.training_session_members AS member
    ON member.session_id = session.id
  JOIN private.platform_v2_content_nodes AS node
    ON node.id = member.context_content_node_id
   AND node.entry_id = member.entry_id
   AND node.kind = 'example'
   AND node.binding_state = 'active'
   AND node.source_text_fingerprint = member.context_source_text_fingerprint
  WHERE session.id = p_session_id
    AND session.user_id = p_user_id
    AND session.training_filter->>'presentationMode' = 'word-in-context'
    AND session.superseded_at IS NULL
    AND member.entry_id = p_entry_id
    AND member.card_type_id = 'definition-to-word'
    AND member.consumed_at IS NULL
    AND member.unavailable_at IS NULL;
  RETURN result;
END;
$$;
ALTER FUNCTION public.read_training_word_context_member(uuid,uuid,uuid)
  OWNER TO postgres;
REVOKE ALL ON FUNCTION public.read_training_word_context_member(uuid,uuid,uuid)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.read_training_word_context_member(uuid,uuid,uuid)
  TO authenticated;

COMMIT;
