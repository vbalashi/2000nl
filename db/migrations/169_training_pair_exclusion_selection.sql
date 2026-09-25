-- Apply narrowly guarded edits to the latest installed function definitions.
-- Preserve all preceding lexical filters, clocks, receipts and session semantics.
-- Exact single-occurrence anchors fail the migration on an unexpected baseline;
-- this avoids copying an older definition over a newer one.
BEGIN;
CREATE FUNCTION pg_temp.patch_training_pair_definition(
  p_signature text, p_before text, p_after text
) RETURNS void LANGUAGE plpgsql AS $$
DECLARE definition text;
BEGIN
  SELECT pg_get_functiondef(p_signature::regprocedure) INTO definition;
  IF strpos(definition,p_after)>0 THEN RETURN; END IF;
  IF (length(definition)-length(replace(definition,p_before,'')))/length(p_before) <> 1 THEN
    RAISE EXCEPTION 'pair-exclusion migration unexpected baseline: %',p_signature;
  END IF;
  EXECUTE replace(definition,p_before,p_after);
END;
$$;
SELECT pg_temp.patch_training_pair_definition(
  'private.training_scheduler_candidates_v2(uuid,text[],uuid,text,text,text,uuid[],text[],jsonb,boolean,boolean)',
$before$    AND known_cards.entry_id IS NULL$before$,
$after$    AND known_cards.entry_id IS NULL
    AND NOT EXISTS (SELECT 1 FROM private.training_pair_exclusions exclusion
      WHERE exclusion.user_id=p_user_id AND exclusion.restored_at IS NULL
        AND exclusion.pair_key=private.training_pair_key_v1(
          'meaning', scope.id, NULL, NULL, mode_order.card_type_id))$after$);

SELECT pg_temp.patch_training_pair_definition(
  'private.platform_v2_idiom_exercise_candidates_v1(uuid,text,integer,integer)',
$before$WHERE COALESCE(hidden, false) = false$before$,
$after$WHERE COALESCE(hidden, false) = false
               AND NOT EXISTS (SELECT 1 FROM private.training_pair_exclusions exclusion
                 WHERE exclusion.user_id=p_user_id AND exclusion.restored_at IS NULL
                   AND exclusion.pair_key=private.training_pair_key_v1(
                     'idiom', shaped.entry_id, shaped.content_node_id, shaped.source_text_fingerprint, NULL))$after$);

SELECT pg_temp.patch_training_pair_definition(
  'private.platform_v2_idiom_exercise_candidates_v2(uuid,text,integer,integer,uuid,text,text,jsonb)',
$before$WHERE COALESCE(hidden, false) = false$before$,
$after$WHERE COALESCE(hidden, false) = false
               AND NOT EXISTS (SELECT 1 FROM private.training_pair_exclusions exclusion
                 WHERE exclusion.user_id=p_user_id AND exclusion.restored_at IS NULL
                   AND exclusion.pair_key=private.training_pair_key_v1(
                     'idiom', shaped.entry_id, shaped.content_node_id, shaped.source_text_fingerprint, NULL))$after$);

SELECT pg_temp.patch_training_pair_definition(
  'private.platform_v2_translation_exercise_candidates_v1(uuid,integer,integer)',
$before$WHERE COALESCE(hidden, false) = false$before$,
$after$WHERE COALESCE(hidden, false) = false
               AND NOT EXISTS (SELECT 1 FROM private.training_pair_exclusions exclusion
                 WHERE exclusion.user_id=p_user_id AND exclusion.restored_at IS NULL
                   AND exclusion.pair_key=private.training_pair_key_v1(
                     'translation', shaped.entry_id, shaped.content_node_id, shaped.source_text_fingerprint, NULL))$after$);

SELECT pg_temp.patch_training_pair_definition(
  'public.read_training_idiom_stats_v1(uuid)',
$before$SELECT node.content_node_id, target.id AS target_id,$before$,
$after$SELECT node.content_node_id, target.id AS target_id,
                   private.training_pair_excluded_v1(v_user_id, 'idiom', node.entry_id,
                     node.content_node_id, node.source_text_fingerprint, NULL) AS excluded,$after$);

SELECT pg_temp.patch_training_pair_definition(
  'public.read_training_idiom_stats_v1(uuid)',
$before$AND NOT COALESCE(hidden, false)$before$,
$after$AND NOT COALESCE(hidden, false) AND NOT excluded$after$);

SELECT pg_temp.patch_training_pair_definition(
  'private.perform_platform_v2_card_action_without_verifiable_receipt(uuid,text,uuid,text,text,uuid,text,text,uuid,jsonb,text,text)',
$before$    PERFORM pg_advisory_xact_lock(
        hashtext(
            p_user_id::text
            || ':'
            || p_entry_id::text$before$,
$after$    IF p_action_id IN ('start-learning', 'review-card') THEN
        PERFORM private.require_training_pair_available_v1(
            p_user_id, 'meaning', p_entry_id, NULL, NULL, p_card_type_id);
    END IF;

    PERFORM pg_advisory_xact_lock(
        hashtext(
            p_user_id::text
            || ':'
            || p_entry_id::text$after$);

SELECT pg_temp.patch_training_pair_definition(
  'private.perform_platform_v2_idiom_exercise_action_v1(uuid,uuid,text,text,uuid,uuid,jsonb)',
$before$    PERFORM pg_advisory_xact_lock(
        hashtext(p_user_id::text || ':exercise-target:' || p_target_id::text)
    );$before$,
$after$    PERFORM private.require_training_pair_available_v1(
        p_user_id, 'idiom', v_target.entry_id, v_target.content_node_id,
        v_target.source_text_fingerprint, NULL);

    PERFORM pg_advisory_xact_lock(
        hashtext(p_user_id::text || ':exercise-target:' || p_target_id::text)
    );$after$);

SELECT pg_temp.patch_training_pair_definition(
  'private.perform_platform_v2_translation_exercise_action_v1(uuid,uuid,text,text,uuid,uuid,jsonb)',
$before$    PERFORM pg_advisory_xact_lock(hashtext(p_user_id::text || ':exercise-target:' || p_target_id::text));$before$,
$after$    PERFORM private.require_training_pair_available_v1(
        p_user_id, 'translation', v_target.entry_id, v_target.content_node_id,
        v_target.source_text_fingerprint, NULL);

    PERFORM pg_advisory_xact_lock(hashtext(p_user_id::text || ':exercise-target:' || p_target_id::text));$after$);

SELECT pg_temp.patch_training_pair_definition(
  'public.handle_card_review(uuid,uuid,text,text,uuid)',
$before$    IF p_turn_id IS NOT NULL THEN$before$,
$after$    PERFORM pg_advisory_xact_lock(hashtext('training-pair:' || p_user_id::text || ':' ||
        private.training_pair_key_v1('meaning', p_entry_id, NULL, NULL, p_card_type_id)));

    IF p_turn_id IS NOT NULL THEN$after$);

SELECT pg_temp.patch_training_pair_definition(
  'public.handle_card_review(uuid,uuid,text,text,uuid)',
$before$    IF p_result = 'hide' THEN$before$,
$after$    PERFORM private.require_training_pair_available_v1(
        p_user_id, 'meaning', p_entry_id, NULL, NULL, p_card_type_id);

    IF p_result = 'hide' THEN$after$);

SELECT pg_temp.patch_training_pair_definition(
  'public.read_platform_v2_idiom_training_session_next(uuid,uuid)',
$before$    SELECT jsonb_build_object(
        'targetId', target.id,$before$,
$after$    IF EXISTS (SELECT 1 FROM private.platform_v2_training_exercise_targets target
      WHERE target.id=v_member.target_id
        AND private.training_pair_excluded_v1(p_user_id, 'idiom', target.entry_id,
          target.content_node_id, target.source_text_fingerprint, NULL)) THEN
      SELECT count(*)::integer INTO v_remaining FROM public.training_session_exercise_members
        WHERE session_id=p_session_id AND consumed_at IS NULL AND unavailable_at IS NULL;
      RETURN jsonb_build_object('status','unavailable','sessionId',p_session_id,
        'ordinal',v_member.ordinal,'targetId',v_member.target_id,
        'reason','pair-excluded','remaining',v_remaining);
    END IF;

    SELECT jsonb_build_object(
        'targetId', target.id,$after$);

SELECT pg_temp.patch_training_pair_definition(
  'public.mark_platform_v2_idiom_training_session_member_unavailable(uuid,uuid,uuid,text)',
$before$p_reason NOT IN ('projection-missing', 'dictionary-access-revoked', 'entry-not-found')$before$,
$after$p_reason NOT IN ('projection-missing', 'dictionary-access-revoked', 'entry-not-found', 'pair-excluded')$after$);

SELECT pg_temp.patch_training_pair_definition(
  'public.mark_platform_v2_idiom_training_session_member_unavailable(uuid,uuid,uuid,text)',
$before$    UPDATE public.training_session_exercise_members$before$,
$after$    IF p_reason='pair-excluded' AND NOT EXISTS (
      SELECT 1 FROM private.platform_v2_training_exercise_targets target
      WHERE target.id=p_target_id AND private.training_pair_excluded_v1(
        p_user_id,'idiom',target.entry_id,target.content_node_id,target.source_text_fingerprint,NULL)
    ) THEN RAISE EXCEPTION 'training_session_unavailable_evidence_mismatch'; END IF;

    UPDATE public.training_session_exercise_members$after$);

SELECT pg_temp.patch_training_pair_definition(
  'public.read_platform_v2_translation_training_session_next(uuid,uuid)',
$before$    SELECT jsonb_build_object(
        'targetId', target.id,$before$,
$after$    IF EXISTS (SELECT 1 FROM private.platform_v2_training_exercise_targets target
      WHERE target.id=v_member.target_id
        AND private.training_pair_excluded_v1(p_user_id, 'translation', target.entry_id,
          target.content_node_id, target.source_text_fingerprint, NULL)) THEN
      SELECT count(*)::integer INTO v_remaining FROM public.training_session_exercise_members
        WHERE session_id=p_session_id AND consumed_at IS NULL AND unavailable_at IS NULL;
      RETURN jsonb_build_object('status','unavailable','sessionId',p_session_id,
        'ordinal',v_member.ordinal,'targetId',v_member.target_id,
        'reason','pair-excluded','remaining',v_remaining);
    END IF;

    SELECT jsonb_build_object(
        'targetId', target.id,$after$);

SELECT pg_temp.patch_training_pair_definition(
  'public.mark_platform_v2_translation_session_member_unavailable(uuid,uuid,uuid,text)',
$before$p_reason NOT IN ('projection-missing', 'dictionary-access-revoked', 'entry-not-found')$before$,
$after$p_reason NOT IN ('projection-missing', 'dictionary-access-revoked', 'entry-not-found', 'pair-excluded')$after$);

SELECT pg_temp.patch_training_pair_definition(
  'public.mark_platform_v2_translation_session_member_unavailable(uuid,uuid,uuid,text)',
$before$    UPDATE public.training_session_exercise_members$before$,
$after$    IF p_reason='pair-excluded' AND NOT EXISTS (
      SELECT 1 FROM private.platform_v2_training_exercise_targets target
      WHERE target.id=p_target_id AND private.training_pair_excluded_v1(
        p_user_id,'translation',target.entry_id,target.content_node_id,target.source_text_fingerprint,NULL)
    ) THEN RAISE EXCEPTION 'training_session_unavailable_evidence_mismatch'; END IF;

    UPDATE public.training_session_exercise_members$after$);

SELECT pg_temp.patch_training_pair_definition(
  'private.get_next_training_session_card_latch_v1(uuid,uuid,text[])',
$before$    v_filter := COALESCE(v_session.training_filter, '{}'::jsonb);$before$,
$after$    IF private.training_pair_excluded_v1(
      p_user_id,'meaning',v_member.entry_id,NULL,NULL,v_member.card_type_id) THEN
      RETURN NEXT jsonb_build_object('trainingSessionUnavailable',true,
        'trainingSessionId',v_session.id,'trainingSessionOrdinal',v_member.ordinal,
        'entryId',v_member.entry_id,'cardTypeId',v_member.card_type_id,'reason','pair-excluded');
      RETURN;
    END IF;

    v_filter := COALESCE(v_session.training_filter, '{}'::jsonb);$after$);

SELECT pg_temp.patch_training_pair_definition(
  'private.mark_training_session_member_unavailable(uuid,uuid,uuid,text,text)',
$before$IF p_reason <> 'direct-example-missing' THEN$before$,
$after$IF p_reason NOT IN ('direct-example-missing','pair-excluded') THEN$after$);

SELECT pg_temp.patch_training_pair_definition(
  'private.mark_training_session_member_unavailable(uuid,uuid,uuid,text,text)',
$before$  IF NOT FOUND
     OR private.training_ordinary_direct_recall_renderable_v1(
       v_entry.id, v_entry.meaning_id, v_member.card_type_id
     ) THEN$before$,
$after$  IF NOT FOUND
     OR (p_reason='pair-excluded' AND NOT private.training_pair_excluded_v1(
       p_user_id,'meaning',v_member.entry_id,NULL,NULL,v_member.card_type_id))
     OR (p_reason='direct-example-missing' AND private.training_ordinary_direct_recall_renderable_v1(
       v_entry.id, v_entry.meaning_id, v_member.card_type_id
     )) THEN$after$);

SELECT pg_temp.patch_training_pair_definition(
  'private.training_local_daily_stats_v1(uuid,text[],uuid,text,text)',
$before$        AND s.hidden = false
        AND s.fsrs_enabled = true$before$,
$after$        AND s.hidden = false
        AND s.fsrs_enabled = true
        AND NOT EXISTS (SELECT 1 FROM private.training_pair_exclusions exclusion
          WHERE exclusion.user_id=p_user_id AND exclusion.restored_at IS NULL
            AND exclusion.pair_key=private.training_pair_key_v1(
              'meaning',s.entry_id,NULL,NULL,s.card_type_id))$after$);

COMMIT;
