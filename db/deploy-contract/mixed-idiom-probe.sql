DO $$
DECLARE body text;
BEGIN
  SELECT pg_get_functiondef('private.start_platform_v2_idiom_training_session_v2(uuid,text,text,uuid,uuid,text,text,jsonb,integer)'::regprocedure) INTO body;
  IF strpos(body, '''direct'', ''reverse'', ''mixed''') = 0
     OR strpos(body, 'ARRAY[''idiom:direct'',''idiom:reverse'']') = 0
     OR (strpos(body, 'ORDER BY candidate.position, selected.direction_order') = 0
         AND NOT (strpos(body, 'ORDER BY CASE WHEN private.training_review_early_v1(v_filter,p_card_filter)') > 0
           AND strpos(body, 'candidate.position, selected.direction_order') > 0
           AND strpos(body, '{state,nextReviewAt}') > 0))
     OR strpos(body, 'resolve_training_material_selection_v1') = 0
     OR strpos(body, 'idiom_training_session_start_idempotency_conflict') = 0
     OR strpos(body, 'auth.uid()') = 0 THEN
    RAISE EXCEPTION 'mixed idiom start contract or preserved guards missing';
  END IF;
  SELECT pg_get_functiondef('private.training_idiom_session_response_v1(uuid,uuid)'::regprocedure) INTO body;
  IF strpos(body, 'THEN ''mixed''') = 0 OR strpos(body, '''direction'', target.direction') = 0 THEN
    RAISE EXCEPTION 'mixed idiom snapshot direction contract missing';
  END IF;
  SELECT pg_get_functiondef('public.read_training_idiom_stats_v1(uuid)'::regprocedure) INTO body;
  IF strpos(body, 'unnest(v_session.card_type_ids)') = 0
     OR strpos(body, 'target.direction = selected.direction') = 0
     OR strpos(body, 'AND NOT excluded') = 0 THEN
    RAISE EXCEPTION 'mixed idiom stats or exclusion contract missing';
  END IF;
  IF has_function_privilege('authenticated', 'private.start_platform_v2_idiom_training_session_v2(uuid,text,text,uuid,uuid,text,text,jsonb,integer)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.start_platform_v2_idiom_training_session(uuid,text,text,uuid,uuid,text,text,jsonb,integer)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.start_platform_v2_idiom_training_session(uuid,text,text,uuid,uuid,text,text,jsonb,integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'mixed idiom privilege boundary changed';
  END IF;
END;
$$;
