-- Add context-only eligibility to the latest installed ordinary scheduler.
-- Patching exact anchors preserves later pair-exclusion and scope amendments.
BEGIN;

CREATE FUNCTION pg_temp.patch_word_context_definition(
  p_signature text, p_before text, p_after text
) RETURNS void LANGUAGE plpgsql AS $$
DECLARE definition text;
BEGIN
  SELECT pg_get_functiondef(p_signature::regprocedure) INTO definition;
  IF strpos(definition, p_after) > 0 THEN RETURN; END IF;
  IF (length(definition)-length(replace(definition,p_before,'')))/length(p_before) <> 1 THEN
    RAISE EXCEPTION 'word-context migration unexpected baseline: %',p_signature;
  END IF;
  EXECUTE replace(definition,p_before,p_after);
END;
$$;

SELECT pg_temp.patch_word_context_definition(
  'private.training_scheduler_candidates_v2(uuid,text[],uuid,text,text,text,uuid[],text[],jsonb,boolean,boolean)',
$before$  WHERE COALESCE(hidden,false)=false AND (frozen_until IS NULL OR frozen_until<=reference_now)$before$,
$after$  WHERE COALESCE(hidden,false)=false AND (frozen_until IS NULL OR frozen_until<=reference_now)
    AND (
      COALESCE((SELECT filter_data->>'presentationMode' FROM filter_values), '')
        <> 'word-in-context'
      OR (
        cards.card_type_id = 'definition-to-word'
        AND EXISTS (
          SELECT 1 FROM private.platform_v2_content_nodes AS example
          WHERE example.entry_id = cards.entry_id
            AND example.kind = 'example'
            AND example.binding_state = 'active'
            AND NULLIF(btrim(example.diagnostic_locator), '') IS NOT NULL
            AND example.diagnostic_locator ~ '^raw\.meanings\[[0-9]+\]\.examples\[[0-9]+\]$'
        )
        AND (
          EXISTS (
            SELECT 1 FROM public.user_card_status AS familiar
            WHERE familiar.user_id = p_user_id
              AND familiar.entry_id = cards.entry_id
              AND familiar.card_type_id IN ('word-to-definition','definition-to-word')
              AND (
                COALESCE(familiar.in_learning,false)
                OR COALESCE(familiar.fsrs_enabled,false)
                OR COALESCE(familiar.fsrs_reps,0) > 0
                OR familiar.last_reviewed_at IS NOT NULL
              )
          )
          OR EXISTS (
            SELECT 1 FROM public.user_card_known_marks AS familiar_known
            WHERE familiar_known.user_id = p_user_id
              AND familiar_known.entry_id = cards.entry_id
              AND familiar_known.card_type_id IN ('word-to-definition','definition-to-word')
              AND familiar_known.cleared_at IS NULL
          )
        )
      )
    )$after$);

-- Ordinary meaning sessions introduce direct before reverse. In context mode
-- direct has already introduced this exact meaning, so its reverse direction
-- can enter as a new ordinary card without inventing sentence state.
SELECT pg_temp.patch_word_context_definition(
  'private.training_scheduler_candidates_v2(uuid,text[],uuid,text,text,text,uuid[],text[],jsonb,boolean,boolean)',
$before$      intrinsic_source <> 'new'
      OR (
        card_type_id = 'word-to-definition'$before$,
$after$      intrinsic_source <> 'new'
      OR (
        card_type_id = 'definition-to-word'
        AND COALESCE((SELECT filter_data->>'presentationMode' FROM filter_values), '')
          = 'word-in-context'
      )
      OR (
        card_type_id = 'word-to-definition'$after$);

SELECT pg_temp.patch_word_context_definition(
  'private.start_training_session_latch_v1(uuid,text[],uuid,text,text,jsonb,text,integer)',
$before$  IF p_card_filter NOT IN ('new', 'review', 'both') THEN$before$,
$after$  IF v_filter->>'presentationMode' = 'word-in-context'
     AND v_modes IS DISTINCT FROM ARRAY['definition-to-word']::text[] THEN
    RAISE EXCEPTION 'word_context_requires_reverse_mode';
  END IF;
  IF p_card_filter NOT IN ('new', 'review', 'both') THEN$after$);

COMMIT;
