-- Session selection may contain both directions; target identity and FSRS remain
-- direction-specific. Patch the latest deployed bodies to retain material scope,
-- pair exclusions, reference clocks and owner/idempotency guards from 161/169/184.
BEGIN;
CREATE FUNCTION pg_temp.patch_mixed_idiom(p_signature text, p_before text, p_after text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE definition text;
BEGIN
  SELECT pg_get_functiondef(p_signature::regprocedure) INTO definition;
  IF (length(definition)-length(replace(definition,p_before,'')))/length(p_before) <> 1 THEN
    RAISE EXCEPTION 'mixed idiom migration unexpected baseline: %',p_signature;
  END IF;
  EXECUTE replace(definition,p_before,p_after);
END;
$$;
SELECT pg_temp.patch_mixed_idiom(
 'private.start_platform_v2_idiom_training_session_v2(uuid,text,text,uuid,uuid,text,text,jsonb,integer)',
 $before$IF p_direction NOT IN ('direct', 'reverse') THEN$before$,
 $after$IF p_direction IS NULL OR p_direction NOT IN ('direct', 'reverse', 'mixed') THEN$after$);
SELECT pg_temp.patch_mixed_idiom(
 'private.start_platform_v2_idiom_training_session_v2(uuid,text,text,uuid,uuid,text,text,jsonb,integer)',
 $before$ARRAY['idiom:' || p_direction],$before$,
 $after$CASE WHEN p_direction = 'mixed' THEN ARRAY['idiom:direct','idiom:reverse']
          ELSE ARRAY['idiom:' || p_direction] END,$after$);
SELECT pg_temp.patch_mixed_idiom(
 'private.start_platform_v2_idiom_training_session_v2(uuid,text,text,uuid,uuid,text,text,jsonb,integer)',
 $before$SELECT candidate.item
          FROM private.platform_v2_idiom_exercise_candidates_v2(
              p_user_id, p_direction, v_requested_total, 0,
              p_list_id, p_list_type, p_card_filter, v_filter
          ) AS candidate(item)$before$,
 $after$SELECT candidate.item
          FROM unnest(CASE WHEN p_direction = 'mixed'
                    THEN ARRAY['direct','reverse'] ELSE ARRAY[p_direction] END)
               WITH ORDINALITY AS selected(direction, direction_order)
          CROSS JOIN LATERAL private.platform_v2_idiom_exercise_candidates_v2(
              p_user_id, selected.direction, v_requested_total, 0,
              p_list_id, p_list_type, p_card_filter, v_filter
          ) WITH ORDINALITY AS candidate(item, position)
          -- Round-robin the bounded directional pools, then retain the existing
          -- new/review rhythm. A missing direction never prevents filling a run.
          ORDER BY candidate.position, selected.direction_order$after$);
SELECT pg_temp.patch_mixed_idiom(
 'private.training_idiom_session_response_v1(uuid,uuid)',
 $before$'direction', split_part(session.card_type_ids[1], ':', 2),$before$,
 $after$'direction', CASE WHEN session.card_type_ids @> ARRAY['idiom:direct','idiom:reverse']
              THEN 'mixed' ELSE split_part(session.card_type_ids[1], ':', 2) END,$after$);
SELECT pg_temp.patch_mixed_idiom(
 'public.read_training_idiom_stats_v1(uuid)',
 $before$FROM private.training_idiom_source_nodes_v1(
                v_user_id, v_direction, v_session.list_id,
                v_session.list_type, v_session.training_filter
            ) node$before$,
 $after$FROM (SELECT DISTINCT split_part(card_type_id, ':', 2) AS direction
                  FROM unnest(v_session.card_type_ids) AS card_type_id) selected
            CROSS JOIN LATERAL private.training_idiom_source_nodes_v1(
                v_user_id, selected.direction, v_session.list_id,
                v_session.list_type, v_session.training_filter
            ) node$after$);
SELECT pg_temp.patch_mixed_idiom(
 'public.read_training_idiom_stats_v1(uuid)',
 $before$AND target.family = 'idiom' AND target.direction = v_direction$before$,
 $after$AND target.family = 'idiom' AND target.direction = selected.direction$after$);
COMMIT;
